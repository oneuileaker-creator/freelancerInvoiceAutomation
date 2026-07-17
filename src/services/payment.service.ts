import Razorpay from 'razorpay'
import crypto from 'crypto'
import { prisma } from '../config/database'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

// Plan config — amounts in paise (₹1 = 100 paise)
export const PLANS = {
  PRO: {
    amount: 9900,          // ₹99
    currency: 'INR',
    description: 'FreelanceFlow Pro — Monthly',
    durationDays: 30,
    tier: 'PRO',
  },
  ANNUAL: {
    amount: 99900,         // ₹999
    currency: 'INR',
    description: 'FreelanceFlow Annual — Yearly',
    durationDays: 365,
    tier: 'ANNUAL',
  },
} as const

export type PlanKey = keyof typeof PLANS

// ── Create Razorpay Order ──────────────────────────────────
export const createOrder = async (planKey: PlanKey, userId: string) => {
  const plan = PLANS[planKey]

  const order = await razorpay.orders.create({
    amount: plan.amount,
    currency: plan.currency,
    notes: {
      userId,
      plan: planKey,
    },
  })

  return {
    order_id: order.id,
    amount: plan.amount,
    currency: plan.currency,
    description: plan.description,
    key_id: process.env.RAZORPAY_KEY_ID!,
  }
}

// ── Verify Payment & Upgrade Subscription ─────────────────
export const verifyAndActivate = async (
  orderId: string,
  paymentId: string,
  signature: string,
  planKey: PlanKey,
  userId: string,
) => {
  // 1. Verify HMAC signature
  const body = `${orderId}|${paymentId}`
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex')

  if (expectedSig !== signature) {
    throw new Error('INVALID_SIGNATURE')
  }

  // 2. Calculate expiry date
  const plan = PLANS[planKey]
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

  // 3. Update subscription in DB
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: plan.tier,
      subscriptionExpiresAt: expiresAt,
    },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
    },
  })

  return {
    subscription_tier: user.subscriptionTier,
    subscription_expires_at: user.subscriptionExpiresAt?.toISOString() ?? null,
  }
}
