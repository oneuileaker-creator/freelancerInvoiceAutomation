import { Request, Response } from 'express'
import { z } from 'zod'
import * as paymentService from '../services/payment.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const createOrderSchema = z.object({
  plan: z.enum(['PRO', 'ANNUAL']),
})

const verifySchema = z.object({
  order_id: z.string().min(1),
  payment_id: z.string().min(1),
  signature: z.string().min(1),
  plan: z.enum(['PRO', 'ANNUAL']),
})

// POST /payments/create-order
export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { plan } = createOrderSchema.parse(req.body)
    const order = await paymentService.createOrder(plan, req.userId!)
    sendSuccess(res, order, 'Order created')
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, data: null, message: 'Invalid plan', errors: null })
      return
    }
    console.error('Create order error:', error)
    sendError(res, 'Failed to create payment order', 500)
  }
}

// POST /payments/verify
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = verifySchema.parse(req.body)
    const result = await paymentService.verifyAndActivate(
      body.order_id,
      body.payment_id,
      body.signature,
      body.plan,
      req.userId!,
    )
    sendSuccess(res, result, 'Subscription activated successfully')
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, data: null, message: 'Invalid data', errors: null })
      return
    }
    if (error.message === 'INVALID_SIGNATURE') {
      sendError(res, 'Payment verification failed', 400)
      return
    }
    console.error('Verify payment error:', error)
    sendError(res, 'Failed to activate subscription', 500)
  }
}

// GET /payments/plans
export const getPlans = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, {
    plans: [
      {
        key: 'PRO',
        name: 'Pro',
        amount: 9900,
        amount_display: '₹99',
        currency: 'INR',
        period: 'month',
        description: 'FreelanceFlow Pro — Monthly',
      },
      {
        key: 'ANNUAL',
        name: 'Annual',
        amount: 99900,
        amount_display: '₹999',
        currency: 'INR',
        period: 'year',
        description: 'FreelanceFlow Annual — Yearly',
        savings: 'Save ₹189 vs monthly',
      },
    ],
  })
}
