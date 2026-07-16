import { Router } from 'express'
import * as invoiceController from '../controllers/invoice.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/', invoiceController.getInvoices)
router.get('/stats', invoiceController.getStats)
router.post('/', invoiceController.createInvoice)
router.get('/:id', invoiceController.getInvoice)
router.put('/:id', invoiceController.updateInvoice)
router.get('/:id/pdf', invoiceController.downloadPdf)
router.post('/:id/send', invoiceController.sendInvoice)
router.post('/:id/mark-paid', invoiceController.markPaid)
router.post('/:id/remind', invoiceController.sendReminder)
router.delete('/:id', invoiceController.deleteInvoice)

export default router
