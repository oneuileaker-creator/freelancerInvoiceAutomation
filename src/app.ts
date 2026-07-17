import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import path from 'path'
import cron from 'node-cron'
import { runReminderScheduler } from './services/reminder.service'

// Load environment variables first
dotenv.config()

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET']

const missingVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
)

const hasBrevo = !!process.env.BREVO_API_KEY
const hasResend = !!process.env.RESEND_API_KEY
const hasSmtp = !!(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
)

if (!hasBrevo && !hasResend && !hasSmtp) {
  missingVars.push('Email Config (Either BREVO_API_KEY, RESEND_API_KEY, or SMTP settings)')
}

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:')
  missingVars.forEach((v) => console.error(`   - ${v}`))
  console.error('\nCheck your .env file or environment settings.')
  process.exit(1)
}

console.log('✓ Environment variables validated')

import authRoutes from './routes/auth.routes'
import clientRoutes from './routes/client.routes'
import invoiceRoutes from './routes/invoice.routes'
import { errorHandler } from './middleware/errorHandler'
import { sendSuccess } from './utils/response'

const app = express()

// ── Global Middlewares ─────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// ── Health Check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  sendSuccess(res, { status: 'UP', timestamp: new Date().toISOString() }, 'Server is healthy')
})

// ── Routes ─────────────────────────────────────────────────
app.use('/auth', authRoutes)
app.use('/clients', clientRoutes)
app.use('/invoices', invoiceRoutes)

// ── 404 Route handler ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    errors: null
  })
})

// ── Global Error Handler ───────────────────────────────────
app.use(errorHandler)

// ── Cron Jobs ──────────────────────────────────────────────
// Run reminder scheduler every hour at minute 0
cron.schedule('0 * * * *', async () => {
  await runReminderScheduler()
}, {
  timezone: 'Asia/Kolkata',   // IST timezone
})

console.log('✓ Reminder scheduler registered (runs hourly, IST)')

// ── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`[Server] running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`)
})

export default app
