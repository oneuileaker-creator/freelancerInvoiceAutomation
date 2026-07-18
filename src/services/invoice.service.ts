import { prisma } from '../config/database'
import { generateInvoiceNumber } from '../utils/invoice-number'
import { emailService } from './email.service'
import { generateInvoicePdf } from '../utils/pdf'

const formatLineItem = (item: any) => ({
  id: item.id,
  description: item.description,
  quantity: item.quantity,
  rate: item.rate,
  amount: item.amount,
})

const formatPayment = (payment: any) => payment ? ({
  id: payment.id,
  amount: payment.amount,
  date: payment.date.toISOString().split('T')[0],
  method: payment.method,
  reference_number: payment.referenceNumber ?? null,
}) : null

const formatReminderLog = (log: any) => ({
  id: log.id,
  sent_at: log.sentAt.toISOString(),
  channel: log.channel,
  status: log.status,
})

const formatClient = (client: any) => ({
  id: client.id,
  name: client.name,
  email: client.email ?? null,
  phone: client.phone ?? null,
  address: client.address ?? null,
  gstin: client.gstin ?? null,
  notes: client.notes ?? null,
  invoice_count: 0,
  total_outstanding: 0,
  created_at: client.createdAt.toISOString(),
})

const formatInvoice = (invoice: any) => ({
  id: invoice.id,
  invoice_number: invoice.invoiceNumber,
  client: formatClient(invoice.client),
  issue_date: invoice.issueDate.toISOString().split('T')[0],
  due_date: invoice.dueDate.toISOString().split('T')[0],
  line_items: invoice.lineItems?.map(formatLineItem) ?? [],
  subtotal: invoice.subtotal,
  gst_percentage: invoice.gstPercentage,
  gst_amount: invoice.gstAmount,
  total: invoice.total,
  status: invoice.status,
  notes: invoice.notes ?? null,
  payment_terms: invoice.paymentTerms ?? null,
  payment: formatPayment(invoice.payment),
  reminder_logs: invoice.reminderLogs?.map(formatReminderLog) ?? [],
  viewed_at: invoice.viewedAt?.toISOString() ?? null,
  view_count: invoice.viewCount,
  created_at: invoice.createdAt.toISOString(),
})

const invoiceInclude = {
  client: true,
  lineItems: true,
  payment: true,
  reminderLogs: {
    orderBy: { sentAt: 'desc' as const }
  },
}

const autoMarkOverdue = async (userId: string) => {
  await prisma.invoice.updateMany({
    where: {
      userId,
      status: 'SENT',
      dueDate: { lt: new Date() },
    },
    data: { status: 'OVERDUE' },
  })
}

export const getInvoices = async (
  userId: string,
  status?: string,
  clientId?: string
) => {
  await autoMarkOverdue(userId)

  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      ...(status ? { status: status as any } : {}),
      ...(clientId ? { clientId } : {}),
    },
    include: invoiceInclude,
    orderBy: { createdAt: 'desc' },
  })

  return {
    invoices: invoices.map(formatInvoice),
    total: invoices.length,
  }
}

export const getStats = async (userId: string) => {
  await autoMarkOverdue(userId)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [pending, overdue, paidThisMonth] = await Promise.all([
    prisma.invoice.aggregate({
      where: { userId, status: 'SENT' },
      _sum: { total: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { userId, status: 'OVERDUE' },
      _sum: { total: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: {
        userId,
        status: 'PAID',
        updatedAt: { gte: startOfMonth },
      },
      _sum: { total: true },
      _count: true,
    }),
  ])

  return {
    total_pending: pending._sum.total ?? 0,
    total_overdue: overdue._sum.total ?? 0,
    total_paid_this_month: paidThisMonth._sum.total ?? 0,
    pending_count: pending._count ?? 0,
    overdue_count: overdue._count ?? 0,
    paid_this_month_count: paidThisMonth._count ?? 0,
  }
}

export const getInvoice = async (invoiceId: string, userId: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: invoiceInclude,
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')
  return formatInvoice(invoice)
}

export const createInvoice = async (userId: string, data: {
  clientId: string
  issueDate: string
  dueDate: string
  lineItems: Array<{
    description: string
    quantity: number
    rate: number
    amount: number
  }>
  subtotal: number
  gstPercentage: number
  gstAmount: number
  total: number
  notes?: string
  paymentTerms?: string
  status: string
}) => {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, userId },
  })
  if (!client) throw new Error('CLIENT_NOT_FOUND')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { invoicePrefix: true },
  })

  const invoiceNumber = await generateInvoiceNumber(
    userId,
    user?.invoicePrefix ?? 'INV'
  )

  const invoice = await prisma.invoice.create({
    data: {
      userId,
      clientId: data.clientId,
      invoiceNumber,
      issueDate: new Date(data.issueDate),
      dueDate: new Date(data.dueDate),
      subtotal: data.subtotal,
      gstPercentage: data.gstPercentage,
      gstAmount: data.gstAmount,
      total: data.total,
      status: data.status as any,
      notes: data.notes ?? null,
      paymentTerms: data.paymentTerms ?? null,
      lineItems: {
        create: data.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })),
      },
    },
    include: invoiceInclude,
  })

  return formatInvoice(invoice)
}

export const updateInvoice = async (
  invoiceId: string,
  userId: string,
  data: {
    clientId: string
    issueDate: string
    dueDate: string
    lineItems: Array<{
      description: string
      quantity: number
      rate: number
      amount: number
    }>
    subtotal: number
    gstPercentage: number
    gstAmount: number
    total: number
    notes?: string
    paymentTerms?: string
  }
) => {
  // Verify ownership
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')

  // Only allow editing DRAFT invoices
  if (invoice.status !== 'DRAFT') {
    throw new Error('CANNOT_EDIT_SENT_INVOICE')
  }

  // Verify client belongs to user
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, userId },
  })
  if (!client) throw new Error('CLIENT_NOT_FOUND')

  // Delete existing line items and recreate
  await prisma.lineItem.deleteMany({
    where: { invoiceId },
  })

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      clientId: data.clientId,
      issueDate: new Date(data.issueDate),
      dueDate: new Date(data.dueDate),
      subtotal: data.subtotal,
      gstPercentage: data.gstPercentage,
      gstAmount: data.gstAmount,
      total: data.total,
      notes: data.notes ?? null,
      paymentTerms: data.paymentTerms ?? null,
      lineItems: {
        create: data.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })),
      },
    },
    include: invoiceInclude,
  })

  return formatInvoice(updated)
}

export const sendInvoice = async (invoiceId: string, userId: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { client: true, lineItems: true, user: true },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')
  if (invoice.status !== 'DRAFT') throw new Error('INVOICE_ALREADY_SENT')

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT' },
    include: invoiceInclude,
  })

  if (invoice.client.email) {
    try {
      await emailService.sendInvoiceToClient(invoice, invoice.client)
    } catch (e) {
      console.error('Email send failed:', e)
    }
  }

  return formatInvoice(updated)
}

export const markPaid = async (
  invoiceId: string,
  userId: string,
  data: {
    amount: number
    date: string
    method: string
    referenceNumber?: string
  }
) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')
  if (invoice.status === 'PAID') throw new Error('INVOICE_ALREADY_PAID')

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'PAID',
      payment: {
        create: {
          amount: data.amount,
          date: new Date(data.date),
          method: data.method,
          referenceNumber: data.referenceNumber ?? null,
        },
      },
    },
    include: invoiceInclude,
  })

  return formatInvoice(updated)
}

export const sendReminder = async (invoiceId: string, userId: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      client: true,
      lineItems: true,
      user: true
    },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')
  if (invoice.status === 'PAID') throw new Error('INVOICE_ALREADY_PAID')

  if (invoice.client.email) {
    await emailService.sendPaymentReminder(invoice, invoice.client)
  }

  await prisma.reminderLog.create({
    data: {
      invoiceId,
      channel: 'EMAIL',
      status: 'SENT',
    },
  })

  return { message: 'Reminder sent' }
}

export const deleteInvoice = async (invoiceId: string, userId: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')

  await prisma.invoice.delete({ where: { id: invoiceId } })
}

export const bulkDeleteInvoices = async (invoiceIds: string[], userId: string) => {
  // Only delete invoices belonging to this user
  const result = await prisma.invoice.deleteMany({
    where: {
      id: { in: invoiceIds },
      userId,
    },
  })
  return { deleted: result.count }
}

export const getInvoicePdf = async (
  invoiceId: string,
  userId: string
): Promise<Buffer> => {
  // Get invoice with all data
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      client: true,
      lineItems: true,
      payment: true,
    },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')

  // Get user (freelancer) data for the PDF header
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      businessName: true,
      address: true,
      phone: true,
      gstin: true,
      upiId: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankIfsc: true,
      bankName: true,
    },
  })

  if (!user) throw new Error('USER_NOT_FOUND')

  // Format invoice dates for PDF
  const invoiceForPdf = {
    ...invoice,
    issueDate: invoice.issueDate.toISOString().split('T')[0],
    dueDate: invoice.dueDate.toISOString().split('T')[0],
    payment: invoice.payment ? {
      ...invoice.payment,
      date: invoice.payment.date.toISOString().split('T')[0],
    } : null,
  }

  return generateInvoicePdf(invoiceForPdf, user)
}
