import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as paymentController from '../controllers/payment.controller'

const router = Router()

// Public: plan listing (no auth needed)
router.get('/plans', paymentController.getPlans)

// Protected: order creation + verification
router.post('/create-order', authenticate, paymentController.createOrder)
router.post('/verify', authenticate, paymentController.verifyPayment)

export default router
