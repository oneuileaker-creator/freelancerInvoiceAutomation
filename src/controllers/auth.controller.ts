import { Request, Response } from 'express'
import { z } from 'zod'
import * as authService from '../services/auth.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { emailService } from '../services/email.service'
import { prisma } from '../config/database'
import bcrypt from 'bcryptjs'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  business_name: z.string().max(100).optional(),
  otp: z.string().length(6, 'OTP must be 6 digits'),
})

const sendOtpSchema = z.object({
  email: z.string().email('Invalid email'),
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

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = sendOtpSchema.parse(req.body)
    await authService.sendRegistrationOtp(body.email)
    sendSuccess(res, null, 'Verification code sent successfully')
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
    sendError(res, 'Failed to send verification code', 500)
  }
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = registerSchema.parse(req.body)

    const result = await authService.registerUser(
      body.name,
      body.email,
      body.password,
      body.business_name,
      body.otp,
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
    if (error.message === 'OTP_REQUIRED') {
      sendError(res, 'Verification code is required', 400, {
        otp: 'Required'
      })
      return
    }
    if (error.message === 'INVALID_OTP') {
      sendError(res, 'Invalid verification code', 400, {
        otp: 'Incorrect code'
      })
      return
    }
    if (error.message === 'OTP_EXPIRED') {
      sendError(res, 'Verification code has expired. Please request a new one.', 400, {
        otp: 'Expired code'
      })
      return
    }
    sendError(res, 'Registration failed', 500)
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body)

    // Pass IP address for logging
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]
      ?? req.socket.remoteAddress
      ?? 'unknown'

    const result = await authService.loginUser(body.email, body.password, ip)
    sendSuccess(res, result, 'Login successful')
  } catch (error: any) {
    if (error.message === 'INVALID_CREDENTIALS') {
      sendError(res, 'Invalid email or password', 401)
      return
    }

    // Handle account lockout
    if (error.message?.startsWith('ACCOUNT_LOCKED:')) {
      const minutes = error.message.split(':')[1]
      sendError(
        res,
        `Account temporarily locked due to too many failed attempts. ` +
        `Please try again in ${minutes} minute${minutes === '1' ? '' : 's'}.`,
        423,   // 423 Locked
      )
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

export const skipOnboarding = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await authService.skipOnboarding(req.userId!)
    sendSuccess(res, user, 'Onboarding completed (skipped)')
  } catch (error) {
    sendError(res, 'Failed to skip onboarding', 500)
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

const reminderSettingsSchema = z.object({
  reminders_enabled: z.boolean(),
  reminder_email_enabled: z.boolean(),
  reminder_days_before: z.number().min(0).max(7).default(2),
  quiet_hours_start: z.number().min(0).max(23).default(21),
  quiet_hours_end: z.number().min(0).max(23).default(9),
})

export const getReminderSettings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        remindersEnabled: true,
        reminderEmailEnabled: true,
        reminderDaysBefore: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    })

    if (!user) {
      sendError(res, 'User not found', 404)
      return
    }

    sendSuccess(res, {
      reminders_enabled: user.remindersEnabled,
      reminder_email_enabled: user.reminderEmailEnabled,
      reminder_days_before: user.reminderDaysBefore,
      quiet_hours_start: user.quietHoursStart,
      quiet_hours_end: user.quietHoursEnd,
    })
  } catch (error) {
    sendError(res, 'Failed to get reminder settings', 500)
  }
}

export const updateReminderSettings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = reminderSettingsSchema.parse(req.body)

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        remindersEnabled: body.reminders_enabled,
        reminderEmailEnabled: body.reminder_email_enabled,
        reminderDaysBefore: body.reminder_days_before,
        quietHoursStart: body.quiet_hours_start,
        quietHoursEnd: body.quiet_hours_end,
      },
      select: {
        remindersEnabled: true,
        reminderEmailEnabled: true,
        reminderDaysBefore: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    })

    sendSuccess(res, {
      reminders_enabled: user.remindersEnabled,
      reminder_email_enabled: user.reminderEmailEnabled,
      reminder_days_before: user.reminderDaysBefore,
      quiet_hours_start: user.quietHoursStart,
      quiet_hours_end: user.quietHoursEnd,
    })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      sendError(res, 'Invalid settings', 400)
      return
    }
    sendError(res, 'Failed to update reminder settings', 500)
  }
}

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password required'),
  new_password: z.string().min(8, 'Min 8 characters'),
})

export const changePassword = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const body = changePasswordSchema.parse(req.body)

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    })

    if (!user) {
      sendError(res, 'User not found', 404)
      return
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(
      body.current_password,
      user.password,
    )

    if (!passwordMatch) {
      sendError(res, 'Current password is incorrect', 400, {
        current_password: 'Incorrect password',
      })
      return
    }

    // Hash new password
    const hashed = await bcrypt.hash(body.new_password, 12)

    await prisma.user.update({
      where: { id: req.userId! },
      data: { password: hashed },
    })

    sendSuccess(res, null, 'Password changed successfully')
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
    sendError(res, 'Failed to change password', 500)
  }
}
