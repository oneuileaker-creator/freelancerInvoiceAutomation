import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../config/database'

export const generateToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '30d') as any }
  )
}

export const formatUser = (user: any) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone ?? null,
  business_name: user.businessName ?? null,
  address: user.address ?? null,
  gstin: user.gstin ?? null,
  is_gst_registered: user.isGstRegistered,
  invoice_prefix: user.invoicePrefix,
  upi_id: user.upiId ?? null,
  bank_account_name: user.bankAccountName ?? null,
  bank_account_number: user.bankAccountNumber ?? null,
  bank_ifsc: user.bankIfsc ?? null,
  bank_name: user.bankName ?? null,
  logo_url: user.logoUrl ?? null,
  subscription_tier: user.subscriptionTier,
  onboarding_complete: user.onboardingComplete,
})

import { emailService } from './email.service'

export const sendRegistrationOtp = async (email: string) => {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error('EMAIL_TAKEN')
  }

  // Generate 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry

  // Upsert Otp in DB
  await prisma.otp.upsert({
    where: { email },
    update: { code, expiresAt },
    create: { email, code, expiresAt },
  })

  // Send email
  await emailService.sendOtp(email, code)
}

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  businessName?: string,
  otpCode?: string,
) => {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error('EMAIL_TAKEN')
  }

  if (!otpCode) {
    throw new Error('OTP_REQUIRED')
  }

  // Verify OTP
  const otpRecord = await prisma.otp.findUnique({ where: { email } })
  if (!otpRecord || otpRecord.code !== otpCode) {
    throw new Error('INVALID_OTP')
  }

  if (otpRecord.expiresAt < new Date()) {
    throw new Error('OTP_EXPIRED')
  }

  // Delete verified OTP record
  await prisma.otp.delete({ where: { email } })

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      businessName: businessName ?? null,
    },
  })

  const token = generateToken(user.id)
  return { token, user: formatUser(user) }
}

export const loginUser = async (
  email: string,
  password: string,
  ipAddress?: string,
) => {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  // ── Check if account is locked ─────────────────────────
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000
    )
    throw new Error(`ACCOUNT_LOCKED:${minutesLeft}`)
  }

  // ── Check password ─────────────────────────────────────
  const passwordMatch = await bcrypt.compare(password, user.password)

  if (!passwordMatch) {
    const newFailedAttempts = user.failedLoginAttempts + 1

    // Lock account after 10 failed attempts for 30 minutes
    const shouldLock = newFailedAttempts >= 10
    const lockedUntil = shouldLock
      ? new Date(Date.now() + 30 * 60 * 1000)
      : null

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newFailedAttempts,
        lockedUntil,
      },
    })

    if (shouldLock) {
      throw new Error('ACCOUNT_LOCKED:30')
    }

    throw new Error('INVALID_CREDENTIALS')
  }

  // ── Success — reset failed attempts ────────────────────
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress ?? null,
    },
  })

  const token = generateToken(user.id)
  return { token, user: formatUser(user) }
}

export const getUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  return formatUser(user)
}

export const updateUserProfile = async (userId: string, data: {
  businessName: string
  address: string
  phone: string
  gstin?: string
  isGstRegistered: boolean
  invoicePrefix: string
  upiId?: string
  bankAccountName?: string
  bankAccountNumber?: string
  bankIfsc?: string
  bankName?: string
}) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      businessName: data.businessName,
      address: data.address,
      phone: data.phone,
      gstin: data.gstin ?? null,
      isGstRegistered: data.isGstRegistered,
      invoicePrefix: data.invoicePrefix,
      upiId: data.upiId ?? null,
      bankAccountName: data.bankAccountName ?? null,
      bankAccountNumber: data.bankAccountNumber ?? null,
      bankIfsc: data.bankIfsc ?? null,
      bankName: data.bankName ?? null,
      onboardingComplete: true,
    },
  })
  return formatUser(user)
}

export const createPasswordResetToken = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const resetToken = crypto.randomBytes(32).toString('hex')
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  })

  return { resetToken, user }
}

export const resetUserPassword = async (
  token: string,
  newPassword: string
) => {
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  })

  if (!user) throw new Error('INVALID_OR_EXPIRED_TOKEN')

  const hashedPassword = await bcrypt.hash(newPassword, 12)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  })
}
