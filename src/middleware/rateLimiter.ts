import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import { sendError } from '../utils/response'

// ── Standard rate limit response ──────────────────────────
// Matches our API response format exactly
const rateLimitHandler = (
  req: Request,
  res: Response,
  next: Function,
  options: any,
) => {
  sendError(
    res,
    options.message ?? 'Too many requests. Please slow down.',
    429,
  )
}

// ── Helper to build key by IP ──────────────────────────────
const keyByIp = (req: Request): string => {
  // Trust proxy headers if behind nginx/railway
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded
    ? (typeof forwarded === 'string' ? forwarded : forwarded[0])
        .split(',')[0]
        .trim()
    : req.socket.remoteAddress ?? 'unknown'
  return `ip:${ip}`
}

// ── Helper to build key by user ID ────────────────────────
const keyByUser = (req: Request): string => {
  const userId = (req as any).userId
  return userId ? `user:${userId}` : keyByIp(req)
}

// ── Helper to build key by user + resource ────────────────
const keyByUserAndResource = (resource: string) => (req: Request): string => {
  const userId = (req as any).userId
  const resourceId = req.params.id ?? 'unknown'
  return userId
    ? `user:${userId}:${resource}:${resourceId}`
    : keyByIp(req)
}

// ══════════════════════════════════════════════════════════
// 1. LOGIN — strictest
//    5 attempts per 15 minutes per IP
// ══════════════════════════════════════════════════════════
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 minutes
  max: 5,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  keyGenerator: keyByIp,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
})

// ══════════════════════════════════════════════════════════
// 2. REGISTER — strict
//    3 accounts per hour per IP
// ══════════════════════════════════════════════════════════
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,    // 1 hour
  max: 3,
  message: 'Too many accounts created from this device. ' +
           'Please try again in an hour.',
  keyGenerator: keyByIp,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
})

// ══════════════════════════════════════════════════════════
// 3. FORGOT PASSWORD — strict
//    3 reset emails per hour per IP
// ══════════════════════════════════════════════════════════
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset requests. Please try again in an hour.',
  keyGenerator: keyByIp,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
})

// ══════════════════════════════════════════════════════════
// 4. GENERAL API — all authenticated routes
//    100 requests per minute per user
// ══════════════════════════════════════════════════════════
export const generalApiRateLimit = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 100,
  message: 'Too many requests. Please slow down.',
  keyGenerator: keyByUser,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
})

// ══════════════════════════════════════════════════════════
// 5. REMINDER — per invoice per user
//    3 manual reminders per hour per invoice
//    Prevents spamming client's inbox
// ══════════════════════════════════════════════════════════
export const reminderRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 3,
  message: 'Too many reminders sent for this invoice. Please wait an hour.',
  keyGenerator: keyByUserAndResource('reminder'),
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
})

// ══════════════════════════════════════════════════════════
// 6. PDF GENERATION — heavy endpoint (puppeteer)
//    20 PDFs per hour per user
// ══════════════════════════════════════════════════════════
export const pdfRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'PDF generation limit reached. Please wait an hour.',
  keyGenerator: keyByUser,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
})

// ══════════════════════════════════════════════════════════
// 7. FILE UPLOAD — logo uploads
//    10 uploads per hour per user
// ══════════════════════════════════════════════════════════
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many uploads. Please wait an hour.',
  keyGenerator: keyByUser,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
})

// ══════════════════════════════════════════════════════════
// 8. INVOICE CREATION — prevent invoice spam
//    30 invoices per hour per user
// ══════════════════════════════════════════════════════════
export const createInvoiceRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Invoice creation limit reached. Please wait an hour.',
  keyGenerator: keyByUser,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
})
