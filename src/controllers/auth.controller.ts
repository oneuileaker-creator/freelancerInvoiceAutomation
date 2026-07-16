import { Request, Response } from 'express'
import { z } from 'zod'
import * as authService from '../services/auth.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { emailService } from '../services/email.service'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  business_name: z.string().max(100).optional(),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

const updateProfileSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(100),
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  gstin: z.string().length(15, 'GSTIN must be 15 characters').nullish().or(z.literal('')),
  is_gst_registered: z.boolean(),
  invoice_prefix: z.string().min(1).max(5).default('INV'),
  upi_id: z.string().nullish(),
  bank_account_name: z.string().nullish(),
  bank_account_number: z.string().nullish(),
  bank_ifsc: z.string().nullish(),
  bank_name: z.string().nullish(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = registerSchema.parse(req.body)

    const result = await authService.registerUser(
      body.name,
      body.email,
      body.password,
      body.business_name
    )

    sendSuccess(res, result, 'Account created successfully', 201)
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: fieldErrors })
      return
    }
    if (error.message === 'EMAIL_TAKEN') {
      sendError(res, 'An account with this email already exists', 409, {
        email: 'Already in use'
      })
      return
    }
    sendError(res, 'Registration failed', 500)
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body)
    const result = await authService.loginUser(body.email, body.password)
    sendSuccess(res, result, 'Login successful')
  } catch (error: any) {
    if (error.message === 'INVALID_CREDENTIALS') {
      sendError(res, 'Invalid email or password', 401)
      return
    }
    sendError(res, 'Login failed', 500)
  }
}

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await authService.getUserProfile(req.userId!)
    sendSuccess(res, user)
  } catch (error) {
    sendError(res, 'Failed to get profile', 500)
  }
}

export const updateProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = updateProfileSchema.parse(req.body)

    const user = await authService.updateUserProfile(req.userId!, {
      businessName: body.business_name,
      address: body.address,
      phone: body.phone,
      gstin: body.gstin || undefined,
      isGstRegistered: body.is_gst_registered,
      invoicePrefix: body.invoice_prefix,
      upiId: body.upi_id || undefined,
      bankAccountName: body.bank_account_name || undefined,
      bankAccountNumber: body.bank_account_number || undefined,
      bankIfsc: body.bank_ifsc || undefined,
      bankName: body.bank_name || undefined,
    })

    sendSuccess(res, user, 'Profile updated')
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: fieldErrors })
      return
    }
    sendError(res, 'Failed to update profile', 500)
  }
}

export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const body = forgotPasswordSchema.parse(req.body)
    const { resetToken, user } = await authService.createPasswordResetToken(
      body.email
    )

    await emailService.sendPasswordReset(user.email, user.name, resetToken)

    sendSuccess(res, null, 'If an account exists, a reset link was sent')
  } catch (error) {
    sendSuccess(res, null, 'If an account exists, a reset link was sent')
  }
}

export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const body = resetPasswordSchema.parse(req.body)
    await authService.resetUserPassword(body.token, body.new_password)
    sendSuccess(res, null, 'Password reset successfully')
  } catch (error: any) {
    if (error.message === 'INVALID_OR_EXPIRED_TOKEN') {
      sendError(res, 'Reset link is invalid or has expired', 400)
      return
    }
    sendError(res, 'Failed to reset password', 500)
  }
}
