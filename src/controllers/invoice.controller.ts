import { Response } from 'express'
import { z } from 'zod'
import * as invoiceService from '../services/invoice.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description required'),
  quantity: z.number().positive('Quantity must be positive'),
  rate: z.number().positive('Rate must be positive'),
  amount: z.number().min(0),
})

const createInvoiceSchema = z.object({
  client_id: z.string().min(1, 'Client is required'),
  issue_date: z.string().min(1, 'Issue date required'),
  due_date: z.string().min(1, 'Due date required'),
  line_items: z.array(lineItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().min(0),
  gst_percentage: z.number().min(0).max(28).default(0),
  gst_amount: z.number().min(0).default(0),
  total: z.number().min(0),
  notes: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
})

const markPaidSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date required'),
  method: z.enum(['UPI', 'Bank Transfer', 'Cash', 'Cheque']),
  reference_number: z.string().optional().nullable(),
})

export const getInvoices = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const status = req.query.status as string | undefined
    const clientId = req.query.client_id as string | undefined
    const result = await invoiceService.getInvoices(req.userId!, status, clientId)
    sendSuccess(res, result)
  } catch (error) {
    sendError(res, 'Failed to fetch invoices', 500)
  }
}

export const getStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const stats = await invoiceService.getStats(req.userId!)
    sendSuccess(res, stats)
  } catch (error) {
    sendError(res, 'Failed to fetch statistics', 500)
  }
}

export const getInvoice = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id, req.userId!)
    sendSuccess(res, invoice)
  } catch (error: any) {
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    sendError(res, 'Failed to fetch invoice', 500)
  }
}

export const createInvoice = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = createInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.createInvoice(req.userId!, {
      clientId: body.client_id,
      issueDate: body.issue_date,
      dueDate: body.due_date,
      lineItems: body.line_items,
      subtotal: body.subtotal,
      gstPercentage: body.gst_percentage,
      gstAmount: body.gst_amount,
      total: body.total,
      notes: body.notes || undefined,
      paymentTerms: body.payment_terms || undefined,
      status: body.status,
    })
    sendSuccess(res, invoice, 'Invoice created', 201)
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: fieldErrors })
      return
    }
    if (error.message === 'CLIENT_NOT_FOUND') {
      sendError(res, 'Selected client not found', 404)
      return
    }
    sendError(res, 'Failed to create invoice', 500)
  }
}

const updateInvoiceSchema = z.object({
  client_id: z.string().min(1, 'Client is required'),
  issue_date: z.string().min(1, 'Issue date required'),
  due_date: z.string().min(1, 'Due date required'),
  line_items: z.array(lineItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().min(0),
  gst_percentage: z.number().min(0).max(28).default(0),
  gst_amount: z.number().min(0).default(0),
  total: z.number().min(0),
  notes: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
})

export const updateInvoice = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = updateInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.updateInvoice(
      req.params.id,
      req.userId!,
      {
        clientId: body.client_id,
        issueDate: body.issue_date,
        dueDate: body.due_date,
        lineItems: body.line_items,
        subtotal: body.subtotal,
        gstPercentage: body.gst_percentage,
        gstAmount: body.gst_amount,
        total: body.total,
        notes: body.notes || undefined,
        paymentTerms: body.payment_terms || undefined,
      }
    )
    sendSuccess(res, invoice, 'Invoice updated')
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({
        success: false,
        data: null,
        message: 'Validation failed',
        errors: fieldErrors,
      })
      return
    }
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    if (error.message === 'CANNOT_EDIT_SENT_INVOICE') {
      sendError(res, 'Only draft invoices can be edited', 400)
      return
    }
    if (error.message === 'CLIENT_NOT_FOUND') {
      sendError(res, 'Client not found', 404)
      return
    }
    sendError(res, 'Failed to update invoice', 500)
  }
}

export const sendInvoice = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const invoice = await invoiceService.sendInvoice(req.params.id, req.userId!)
    sendSuccess(res, invoice, 'Invoice sent successfully')
  } catch (error: any) {
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    if (error.message === 'INVOICE_ALREADY_SENT') {
      sendError(res, 'Invoice has already been sent', 400)
      return
    }
    sendError(res, 'Failed to send invoice', 500)
  }
}

export const markPaid = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = markPaidSchema.parse(req.body)
    const invoice = await invoiceService.markPaid(req.params.id, req.userId!, {
      amount: body.amount,
      date: body.date,
      method: body.method,
      referenceNumber: body.reference_number || undefined,
    })
    sendSuccess(res, invoice, 'Payment recorded')
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: fieldErrors })
      return
    }
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    if (error.message === 'INVOICE_ALREADY_PAID') {
      sendError(res, 'Invoice has already been marked paid', 400)
      return
    }
    sendError(res, 'Failed to record payment', 500)
  }
}

export const sendReminder = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await invoiceService.sendReminder(req.params.id, req.userId!)
    sendSuccess(res, result, 'Reminder notification sent')
  } catch (error: any) {
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    if (error.message === 'INVOICE_ALREADY_PAID') {
      sendError(res, 'Cannot send reminder for paid invoice', 400)
      return
    }
    sendError(res, 'Failed to send reminder', 500)
  }
}

export const deleteInvoice = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    await invoiceService.deleteInvoice(req.params.id, req.userId!)
    sendSuccess(res, null, 'Invoice deleted')
  } catch (error: any) {
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    if (error.message === 'CANNOT_DELETE_SENT_INVOICE') {
      sendError(res, 'Only draft invoices can be deleted', 400)
      return
    }
    sendError(res, 'Failed to delete invoice', 500)
  }
}

export const downloadPdf = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const pdfBuffer = await invoiceService.getInvoicePdf(
      req.params.id,
      req.userId!
    )

    // Get invoice number for filename
    const invoice = await invoiceService.getInvoice(req.params.id, req.userId!)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoice_number}.pdf"`
    )
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  } catch (error: any) {
    if (error.message === 'INVOICE_NOT_FOUND') {
      sendError(res, 'Invoice not found', 404)
      return
    }
    console.error('PDF generation error:', error)
    sendError(res, 'Failed to generate PDF', 500)
  }
}

