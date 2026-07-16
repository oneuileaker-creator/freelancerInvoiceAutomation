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

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  businessName?: string
) => {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error('EMAIL_TAKEN')
  }

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

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const passwordMatch = await bcrypt.compare(password, user.password)
  if (!passwordMatch) {
    throw new Error('INVALID_CREDENTIALS')
  }

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
