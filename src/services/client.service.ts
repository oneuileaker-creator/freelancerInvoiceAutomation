import { prisma } from '../config/database'

const formatClient = (client: any, invoiceCount?: number, totalOutstanding?: number) => ({
  id: client.id,
  name: client.name,
  email: client.email ?? null,
  phone: client.phone ?? null,
  address: client.address ?? null,
  gstin: client.gstin ?? null,
  notes: client.notes ?? null,
  invoice_count: invoiceCount ?? client._count?.invoices ?? 0,
  total_outstanding: totalOutstanding ?? 0,
  created_at: client.createdAt.toISOString(),
})

const formatClientDetail = (client: any) => ({
  ...formatClient(client),
  invoices: client.invoices?.map((inv: any) => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    total: inv.total,
    status: inv.status,
    due_date: inv.dueDate.toISOString().split('T')[0],
    issue_date: inv.issueDate.toISOString().split('T')[0],
  })) ?? [],
})

export const getClients = async (userId: string, search?: string) => {
  const clients = await prisma.client.findMany({
    where: {
      userId,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      } : {}),
    },
    include: {
      _count: { select: { invoices: true } },
      invoices: {
        where: {
          status: { in: ['SENT', 'OVERDUE'] }
        },
        select: { total: true }
      }
    },
    orderBy: { createdAt: 'desc' },
  })

  const formatted = clients.map((client) => {
    const outstanding = client.invoices.reduce(
      (sum, inv) => sum + inv.total, 0
    )
    return formatClient(client, client._count.invoices, outstanding)
  })

  return {
    clients: formatted,
    total: formatted.length,
  }
}

export const getClient = async (clientId: string, userId: string) => {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    include: {
      _count: { select: { invoices: true } },
      invoices: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
          issueDate: true,
        }
      }
    }
  })

  if (!client) throw new Error('CLIENT_NOT_FOUND')

  const outstanding = client.invoices
    .filter(inv => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + inv.total, 0)

  return {
    ...formatClientDetail(client),
    total_outstanding: outstanding,
    invoice_count: client._count.invoices,
  }
}

export const createClient = async (userId: string, data: {
  name: string
  email?: string
  phone?: string
  address?: string
  gstin?: string
  notes?: string
}) => {
  const client = await prisma.client.create({
    data: {
      userId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      gstin: data.gstin?.toUpperCase() ?? null,
      notes: data.notes ?? null,
    },
    include: { _count: { select: { invoices: true } } },
  })

  return formatClient(client)
}

export const updateClient = async (
  clientId: string,
  userId: string,
  data: {
    name: string
    email?: string
    phone?: string
    address?: string
    gstin?: string
    notes?: string
  }
) => {
  const existing = await prisma.client.findFirst({
    where: { id: clientId, userId },
  })
  if (!existing) throw new Error('CLIENT_NOT_FOUND')

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      gstin: data.gstin?.toUpperCase() ?? null,
      notes: data.notes ?? null,
    },
    include: { _count: { select: { invoices: true } } },
  })

  return formatClient(client)
}

export const deleteClient = async (clientId: string, userId: string) => {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    include: { _count: { select: { invoices: true } } },
  })

  if (!client) throw new Error('CLIENT_NOT_FOUND')

  if (client._count.invoices > 0) {
    throw new Error('CLIENT_HAS_INVOICES')
  }

  await prisma.client.delete({ where: { id: clientId } })
}
