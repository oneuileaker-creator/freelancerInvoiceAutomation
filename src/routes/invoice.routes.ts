import { Router } from 'express'
import * as invoiceController from '../controllers/invoice.controller'
import { authenticate } from '../middleware/auth'
import {
  generalApiRateLimit,
  reminderRateLimit,
  pdfRateLimit,
  createInvoiceRateLimit,
} from '../middleware/rateLimiter'

const router = Router()

// All invoice routes require auth
router.use(authenticate)

// General rate limit on all invoice routes
router.use(generalApiRateLimit)

router.get('/', invoiceController.getInvoices)
router.get('/stats', invoiceController.getStats)

// Create invoice with extra rate limit protection
router.post('/', createInvoiceRateLimit, invoiceController.createInvoice)

router.get('/:id', invoiceController.getInvoice)
router.put('/:id', invoiceController.updateInvoice)
router.delete('/:id', invoiceController.deleteInvoice)
router.delete('/', invoiceController.bulkDeleteInvoices)
router.post('/:id/send', invoiceController.sendInvoice)
router.post('/:id/mark-paid', invoiceController.markPaid)

// Reminder with strict limit per invoice
router.post('/:id/remind', reminderRateLimit, invoiceController.sendReminder)

// PDF download with heavy operation limit
router.get('/:id/pdf', pdfRateLimit, invoiceController.downloadPdf)

export default router
