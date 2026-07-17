Phase 5 — Automated Reminders
What We're Building
text

Backend:
  ✓ Reminder scheduler (cron job — runs every hour)
  ✓ Reminder logic (which invoices need reminders + when)
  ✓ Reminder templates (WhatsApp message + email)
  ✓ Reminder log tracking
  ✓ Reminder settings per user

Android:
  ✓ Reminder settings screen
  ✓ Manual reminder trigger (already wired, now fully working)
  ✓ Reminder log display in invoice detail
  ✓ WhatsApp deep link handler
Part A — Backend: Reminder Scheduler
Step 1 — Install Scheduler Library
Bash

# In freelanceflow-backend folder
npm install node-cron
npm install -D @types/node-cron
Step 2 — Reminder Service
src/services/reminder.service.ts
TypeScript

import { prisma } from '../config/database'
import { emailService } from './email.service'

// ── Reminder schedule rules ────────────────────────────────
// These define WHEN we send reminders relative to due date
const REMINDER_RULES = [
  {
    name: 'due_soon_2_days',
    daysRelative: -2,    // 2 days BEFORE due date
    type: 'DUE_SOON',
  },
  {
    name: 'due_tomorrow',
    daysRelative: -1,    // 1 day BEFORE due date
    type: 'DUE_SOON',
  },
  {
    name: 'overdue_1_day',
    daysRelative: 1,     // 1 day AFTER due date
    type: 'OVERDUE',
  },
  {
    name: 'overdue_3_days',
    daysRelative: 3,
    type: 'OVERDUE',
  },
  {
    name: 'overdue_7_days',
    daysRelative: 7,
    type: 'OVERDUE',
  },
  {
    name: 'overdue_15_days',
    daysRelative: 15,
    type: 'OVERDUE',
  },
]

// ── Calculate target due date for each rule ────────────────
const getTargetDueDate = (daysRelative: number): Date => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)       // start of today
  date.setDate(date.getDate() - daysRelative)
  // daysRelative = -2 → target invoices due 2 days from now
  // daysRelative = 7  → target invoices that were due 7 days ago
  return date
}

// ── Check if reminder already sent today ──────────────────
const wasReminderSentToday = async (
  invoiceId: string,
  reminderType: string,
): Promise<boolean> => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const existing = await prisma.reminderLog.findFirst({
    where: {
      invoiceId,
      status: reminderType,
      sentAt: {
        gte: today,
        lt: tomorrow,
      },
    },
  })

  return existing !== null
}

// ── Build WhatsApp message ─────────────────────────────────
export const buildWhatsAppMessage = (
  invoice: any,
  user: any,
  reminderType: string,
  daysOverdue: number,
): string => {
  const clientFirstName = invoice.client.name.split(' ')[0]
  const businessName = user.businessName ?? user.name
  const amount = `₹${invoice.total.toLocaleString('en-IN')}`
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (reminderType === 'DUE_SOON') {
    return `Hi ${clientFirstName},

This is a friendly reminder that invoice *${invoice.invoiceNumber}* for *${amount}* from ${businessName} is due on *${dueDate}*.

Please process the payment at your convenience.

Thank you! 🙏`
  }

  if (daysOverdue <= 3) {
    return `Hi ${clientFirstName},

Invoice *${invoice.invoiceNumber}* for *${amount}* from ${businessName} was due on ${dueDate}.

Could you please process the payment? Let us know if you have any questions.

Thank you!`
  }

  if (daysOverdue <= 7) {
    return `Hi ${clientFirstName},

Gentle reminder — invoice *${invoice.invoiceNumber}* for *${amount}* from ${businessName} is now *${daysOverdue} days overdue* (due date: ${dueDate}).

Please process the payment as soon as possible.

Thank you!`
  }

  // 15+ days
  return `Hi ${clientFirstName},

This is an important reminder that invoice *${invoice.invoiceNumber}* for *${amount}* from ${businessName} is now *${daysOverdue} days overdue*.

Kindly process the payment immediately or contact us to discuss.

Thank you!`
}

// ── Process single invoice reminder ───────────────────────
const processInvoiceReminder = async (
  invoice: any,
  user: any,
  reminderType: string,
  daysRelative: number,
): Promise<void> => {
  // Check if already reminded today for this rule
  const alreadySent = await wasReminderSentToday(invoice.id, reminderType)
  if (alreadySent) return

  const daysOverdue = Math.max(0, daysRelative)
  let emailSent = false
  let emailError: string | null = null

  // Send email reminder if client has email
  if (invoice.client.email) {
    try {
      await emailService.sendPaymentReminder(invoice, invoice.client)
      emailSent = true
    } catch (error: any) {
      emailError = error.message
      console.error(
        `Email reminder failed for invoice ${invoice.invoiceNumber}:`,
        error.message,
      )
    }
  }

  // Log the reminder
  await prisma.reminderLog.create({
    data: {
      invoiceId: invoice.id,
      channel: 'EMAIL',
      status: emailSent ? 'SENT' : 'FAILED',
    },
  })

  // Log WhatsApp as PENDING
  // Actual WhatsApp is sent by freelancer via deep link on their phone
  // Automated WhatsApp requires Gupshup/Interakt (Phase 5.1 upgrade)
  if (invoice.client.phone) {
    await prisma.reminderLog.create({
      data: {
        invoiceId: invoice.id,
        channel: 'WHATSAPP',
        status: 'PENDING',   // pending until freelancer sends it
      },
    })
  }

  // Notify the FREELANCER if invoice is very overdue
  if (daysOverdue >= 7 && user.email) {
    try {
      await emailService.sendOverdueAlertToFreelancer(invoice, user, daysOverdue)
    } catch (error) {
      console.error('Freelancer overdue alert failed:', error)
    }
  }

  console.log(
    `✓ Reminder processed: ${invoice.invoiceNumber} | ` +
    `${reminderType} | Email: ${emailSent ? 'sent' : 'failed'}`,
  )
}

// ── Main scheduler function ────────────────────────────────
// Called by the cron job every hour
export const runReminderScheduler = async (): Promise<void> => {
  console.log(`\n[${new Date().toISOString()}] Running reminder scheduler...`)

  let totalProcessed = 0
  let totalErrors = 0

  try {
    for (const rule of REMINDER_RULES) {
      const targetDueDate = getTargetDueDate(rule.daysRelative)

      // Find the next day boundary for precise date matching
      const nextDay = new Date(targetDueDate)
      nextDay.setDate(nextDay.getDate() + 1)

      // Find all invoices that match this rule
      const invoices = await prisma.invoice.findMany({
        where: {
          status: { in: ['SENT', 'OVERDUE'] },
          dueDate: {
            gte: targetDueDate,
            lt: nextDay,
          },
        },
        include: {
          client: true,
          lineItems: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              businessName: true,
              upiId: true,
              bankAccountNumber: true,
              bankIfsc: true,
              bankName: true,
            },
          },
        },
      })

      if (invoices.length > 0) {
        console.log(
          `[${rule.name}] Found ${invoices.length} invoice(s) to remind`
        )
      }

      // Process each invoice
      for (const invoice of invoices) {
        try {
          // Format dates for template building
          const invoiceFormatted = {
            ...invoice,
            dueDate: invoice.dueDate.toISOString().split('T')[0],
            issueDate: invoice.issueDate.toISOString().split('T')[0],
            total: invoice.total,
          }

          await processInvoiceReminder(
            invoiceFormatted,
            invoice.user,
            rule.type,
            rule.daysRelative,
          )
          totalProcessed++
        } catch (error) {
          totalErrors++
          console.error(
            `Error processing reminder for invoice ${invoice.invoiceNumber}:`,
            error,
          )
        }
      }
    }

    console.log(
      `[Scheduler] Done. Processed: ${totalProcessed}, Errors: ${totalErrors}\n`
    )
  } catch (error) {
    console.error('[Scheduler] Fatal error:', error)
  }
}

// ── Get reminder stats for a user ─────────────────────────
export const getReminderStats = async (userId: string) => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const stats = await prisma.reminderLog.findMany({
    where: {
      invoice: { userId },
      sentAt: { gte: thirtyDaysAgo },
    },
    select: {
      channel: true,
      status: true,
    },
  })

  const emailSent = stats.filter(
    (s) => s.channel === 'EMAIL' && s.status === 'SENT'
  ).length
  const whatsappPending = stats.filter(
    (s) => s.channel === 'WHATSAPP' && s.status === 'PENDING'
  ).length
  const total = stats.length

  return { emailSent, whatsappPending, total }
}
Step 3 — Update Email Service (Add Overdue Alert)
Add to src/services/email.service.ts
TypeScript

// Add this method inside the EmailService class

async sendOverdueAlertToFreelancer(
  invoice: any,
  user: any,
  daysOverdue: number,
): Promise<void> {
  const formatRupeesLocal = (amount: number) =>
    `₹${amount.toLocaleString('en-IN')}`

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="font-family:Arial,sans-serif;background:#F9F9F9;
               margin:0;padding:40px 20px">
    <div style="max-width:500px;margin:0 auto;background:#FFFFFF;
                border:1px solid #E4E4E4;border-radius:8px;padding:32px">

      <div style="font-size:18px;font-weight:700;color:#FF4444;margin-bottom:16px">
        ⚠️ Invoice Overdue — ${daysOverdue} Days
      </div>

      <p style="color:#6B6B6B;font-size:14px;line-height:1.6">
        Hi ${user.name},
      </p>

      <p style="color:#6B6B6B;font-size:14px;line-height:1.6">
        Your invoice <strong>${invoice.invoiceNumber}</strong> from
        <strong>${invoice.client.name}</strong> is now
        <strong style="color:#FF4444">${daysOverdue} days overdue</strong>.
      </p>

      <div style="background:#FFF5F5;border:1px solid #FFCCCC;
                  border-radius:6px;padding:16px;margin:20px 0">
        <div style="font-size:12px;color:#6B6B6B">Outstanding Amount</div>
        <div style="font-size:28px;font-weight:700;
                    color:#FF4444">${formatRupeesLocal(invoice.total)}</div>
        <div style="font-size:12px;color:#6B6B6B;margin-top:6px">
          Client: ${invoice.client.name}
        </div>
        ${invoice.client.phone ? `
        <div style="font-size:12px;color:#6B6B6B">
          Phone: ${invoice.client.phone}
        </div>
        ` : ''}
        ${invoice.client.email ? `
        <div style="font-size:12px;color:#6B6B6B">
          Email: ${invoice.client.email}
        </div>
        ` : ''}
      </div>

      <p style="color:#6B6B6B;font-size:13px">
        We've already sent automatic reminders to your client.
        You may want to follow up directly.
      </p>

      <p style="color:#6B6B6B;font-size:13px;margin-top:16px">
        — FreelanceFlow
      </p>
    </div>
  </body>
  </html>
  `

  await transporter.sendMail({
    from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: `⚠️ ${daysOverdue} Days Overdue — ${invoice.client.name} (${invoice.invoiceNumber})`,
    html,
  })
}
Step 4 — Register Cron Job in App
Update src/app.ts — add scheduler
TypeScript

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import cron from 'node-cron'

import authRoutes from './routes/auth.routes'
import clientRoutes from './routes/client.routes'
import invoiceRoutes from './routes/invoice.routes'
import { errorHandler } from './middleware/errorHandler'
import { runReminderScheduler } from './services/reminder.service'

dotenv.config()

// ── Env validation ─────────────────────────────────────────
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
]

const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error('❌ Missing environment variables:')
  missingVars.forEach((v) => console.error(`   - ${v}`))
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT ?? 8080

// ── Middleware ─────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  })
})

// ── Routes ─────────────────────────────────────────────────
app.use('/auth', authRoutes)
app.use('/clients', clientRoutes)
app.use('/invoices', invoiceRoutes)

// ── 404 ────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  })
})

// ── Error handler ──────────────────────────────────────────
app.use(errorHandler)

// ── Cron Jobs ──────────────────────────────────────────────
// Run reminder scheduler every hour at minute 0
// "0 * * * *" = at minute 0 of every hour
// Change to "*/5 * * * *" during dev to test every 5 minutes
cron.schedule('0 * * * *', async () => {
  await runReminderScheduler()
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata',   // IST timezone — important for Indian users
})

console.log('✓ Reminder scheduler registered (runs hourly, IST)')

// ── Start server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ◆ FreelanceFlow API
  ─────────────────────────────────
  Server:     http://localhost:${PORT}
  Health:     http://localhost:${PORT}/health
  Environment: ${process.env.NODE_ENV}
  Scheduler:  Hourly at :00 (IST)
  ─────────────────────────────────
  `)
})

export default app
Step 5 — Reminder Settings API
Add reminder settings to Prisma schema
prisma

// Add these fields to the User model in schema.prisma

model User {
  // ... existing fields ...

  // Reminder settings
  remindersEnabled      Boolean @default(true) @map("reminders_enabled")
  reminderEmailEnabled  Boolean @default(true) @map("reminder_email_enabled")
  reminderDaysBefore    Int     @default(2)    @map("reminder_days_before")
  // Quiet hours (don't send between these hours IST)
  quietHoursStart       Int     @default(21)   @map("quiet_hours_start")  // 9 PM
  quietHoursEnd         Int     @default(9)    @map("quiet_hours_end")    // 9 AM
}
Bash

# Run migration for new fields
npx prisma migrate dev --name add_reminder_settings
Add reminder routes to src/routes/auth.routes.ts
TypeScript

// Add these routes to auth.routes.ts
import { getReminderSettings, updateReminderSettings } from '../controllers/auth.controller'

router.get('/reminder-settings', authenticate, getReminderSettings)
router.put('/reminder-settings', authenticate, updateReminderSettings)
Add to src/controllers/auth.controller.ts
TypeScript

// Add these controller methods

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
Update reminder scheduler to respect user settings
Update src/services/reminder.service.ts — add quiet hours check
TypeScript

// Add this helper function
const isQuietHours = (
  quietHoursStart: number,
  quietHoursEnd: number,
): boolean => {
  const nowHour = new Date().getHours()  // IST hour (server must be IST)

  if (quietHoursStart > quietHoursEnd) {
    // Overnight quiet hours (e.g., 21 to 9)
    return nowHour >= quietHoursStart || nowHour < quietHoursEnd
  } else {
    // Same-day quiet hours
    return nowHour >= quietHoursStart && nowHour < quietHoursEnd
  }
}

// Update the invoice query in runReminderScheduler
// to include user reminder settings
const invoices = await prisma.invoice.findMany({
  where: {
    status: { in: ['SENT', 'OVERDUE'] },
    dueDate: {
      gte: targetDueDate,
      lt: nextDay,
    },
    // Only for users who have reminders enabled
    user: {
      remindersEnabled: true,
    },
  },
  include: {
    client: true,
    lineItems: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        upiId: true,
        bankAccountNumber: true,
        bankIfsc: true,
        bankName: true,
        remindersEnabled: true,
        reminderEmailEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    },
  },
})

// Then inside the invoice loop, add quiet hours check:
for (const invoice of invoices) {
  try {
    // Skip if quiet hours for this user
    if (isQuietHours(
      invoice.user.quietHoursStart,
      invoice.user.quietHoursEnd,
    )) {
      console.log(
        `[${rule.name}] Skipping ${invoice.invoiceNumber} — quiet hours`
      )
      continue
    }

    // ... rest of processing
  }
}
Part B — Android: Reminder Settings Screen
Step 6 — Reminder Models + API
data/models/ReminderModels.kt
Kotlin

package com.freelanceflow.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ReminderSettingsDto(
    @SerialName("reminders_enabled")
    val remindersEnabled: Boolean = true,
    @SerialName("reminder_email_enabled")
    val reminderEmailEnabled: Boolean = true,
    @SerialName("reminder_days_before")
    val reminderDaysBefore: Int = 2,
    @SerialName("quiet_hours_start")
    val quietHoursStart: Int = 21,
    @SerialName("quiet_hours_end")
    val quietHoursEnd: Int = 9,
)
Add to data/api/AuthApi.kt
Kotlin

// Add these to AuthApi interface

@GET("auth/reminder-settings")
suspend fun getReminderSettings(): Response<ApiResponse<ReminderSettingsDto>>

@PUT("auth/reminder-settings")
suspend fun updateReminderSettings(
    @Body body: ReminderSettingsDto,
): Response<ApiResponse<ReminderSettingsDto>>
Add to data/repository/AuthRepository.kt
Kotlin

// Add these methods to AuthRepository

suspend fun getReminderSettings(): Result<ReminderSettingsDto> {
    return try {
        val response = api.getReminderSettings()
        if (response.isSuccessful) {
            val body = response.body()
            if (body?.success == true && body.data != null) {
                Result.Success(body.data)
            } else {
                Result.Error(body?.message ?: "Failed to get settings")
            }
        } else {
            Result.Error("Failed to get reminder settings")
        }
    } catch (e: Exception) {
        Result.Error("Network error. Check your connection.")
    }
}

suspend fun updateReminderSettings(
    settings: ReminderSettingsDto,
): Result<ReminderSettingsDto> {
    return try {
        val response = api.updateReminderSettings(settings)
        if (response.isSuccessful) {
            val body = response.body()
            if (body?.success == true && body.data != null) {
                Result.Success(body.data)
            } else {
                Result.Error(body?.message ?: "Failed to update settings")
            }
        } else {
            Result.Error("Failed to update reminder settings")
        }
    } catch (e: Exception) {
        Result.Error("Network error. Check your connection.")
    }
}
Step 7 — Reminder Settings ViewModel
ui/screens/settings/ReminderSettingsViewModel.kt
Kotlin

package com.freelanceflow.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.freelanceflow.data.models.ReminderSettingsDto
import com.freelanceflow.data.repository.AuthRepository
import com.freelanceflow.data.repository.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReminderSettingsUiState(
    val remindersEnabled: Boolean = true,
    val emailEnabled: Boolean = true,
    val daysBefore: Int = 2,
    val quietHoursStart: Int = 21,
    val quietHoursEnd: Int = 9,
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ReminderSettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReminderSettingsUiState())
    val uiState: StateFlow<ReminderSettingsUiState> = _uiState

    init {
        loadSettings()
    }

    private fun loadSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            when (val result = authRepository.getReminderSettings()) {
                is Result.Success -> {
                    val settings = result.data
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            remindersEnabled = settings.remindersEnabled,
                            emailEnabled = settings.reminderEmailEnabled,
                            daysBefore = settings.reminderDaysBefore,
                            quietHoursStart = settings.quietHoursStart,
                            quietHoursEnd = settings.quietHoursEnd,
                        )
                    }
                }
                is Result.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, error = result.message)
                    }
                }
                Result.Loading -> Unit
            }
        }
    }

    fun onRemindersEnabledChange(enabled: Boolean) {
        _uiState.update { it.copy(remindersEnabled = enabled) }
        saveSettings()
    }

    fun onEmailEnabledChange(enabled: Boolean) {
        _uiState.update { it.copy(emailEnabled = enabled) }
        saveSettings()
    }

    fun onDaysBeforeChange(days: Int) {
        _uiState.update { it.copy(daysBefore = days) }
        saveSettings()
    }

    fun onQuietHoursStartChange(hour: Int) {
        _uiState.update { it.copy(quietHoursStart = hour) }
        saveSettings()
    }

    fun onQuietHoursEndChange(hour: Int) {
        _uiState.update { it.copy(quietHoursEnd = hour) }
        saveSettings()
    }

    // Auto-save on every change
    private fun saveSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, isSaved = false) }
            val s = _uiState.value

            when (authRepository.updateReminderSettings(
                ReminderSettingsDto(
                    remindersEnabled = s.remindersEnabled,
                    reminderEmailEnabled = s.emailEnabled,
                    reminderDaysBefore = s.daysBefore,
                    quietHoursStart = s.quietHoursStart,
                    quietHoursEnd = s.quietHoursEnd,
                )
            )) {
                is Result.Success -> {
                    _uiState.update { it.copy(isSaving = false, isSaved = true) }
                }
                is Result.Error -> {
                    _uiState.update { it.copy(isSaving = false) }
                }
                Result.Loading -> Unit
            }
        }
    }
}
Step 8 — Reminder Settings Screen
ui/screens/settings/ReminderSettingsScreen.kt
Kotlin

package com.freelanceflow.ui.screens.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.freelanceflow.ui.components.AppDivider
import com.freelanceflow.ui.components.AppTopBar
import com.freelanceflow.ui.theme.BorderGray
import com.freelanceflow.ui.theme.InterFamily
import com.freelanceflow.ui.theme.Mint
import com.freelanceflow.ui.theme.MutedGray
import com.freelanceflow.ui.theme.NearBlack
import com.freelanceflow.ui.theme.OffWhite
import com.freelanceflow.ui.theme.White

@Composable
fun ReminderSettingsScreen(
    onBack: () -> Unit,
    viewModel: ReminderSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(White)
            .systemBarsPadding(),
    ) {
        AppTopBar(
            title = "Reminders",
            onBack = onBack,
            actions = {
                // Auto-save indicator
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(18.dp)
                            .padding(end = 16.dp),
                        color = Mint,
                        strokeWidth = 2.dp,
                    )
                } else if (state.isSaved) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Saved",
                        tint = Mint,
                        modifier = Modifier.padding(end = 16.dp),
                    )
                }
            }
        )
        AppDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            // ── Master toggle ──────────────────────────
            SettingsToggleRow(
                title = "Auto Reminders",
                subtitle = "Automatically remind clients about unpaid invoices",
                checked = state.remindersEnabled,
                onCheckedChange = viewModel::onRemindersEnabledChange,
            )

            Spacer(modifier = Modifier.height(24.dp))
            AppDivider()
            Spacer(modifier = Modifier.height(24.dp))

            // ── Content only shows when reminders ON ───
            AnimatedVisibility(
                visible = state.remindersEnabled,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                Column {

                    // ── Channels ───────────────────────
                    SectionLabel(text = "REMINDER CHANNELS")
                    Spacer(modifier = Modifier.height(12.dp))

                    SettingsToggleRow(
                        title = "Email",
                        subtitle = "Send reminder emails to client",
                        checked = state.emailEnabled,
                        onCheckedChange = viewModel::onEmailEnabledChange,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // WhatsApp deep link — always available (free)
                    InfoCard(
                        title = "WhatsApp",
                        body = "WhatsApp reminders are sent manually via the " +
                                "Send Reminder button on each invoice. " +
                                "Tap it to open WhatsApp with a pre-filled message.",
                    )

                    Spacer(modifier = Modifier.height(28.dp))
                    AppDivider()
                    Spacer(modifier = Modifier.height(28.dp))

                    // ── Schedule ───────────────────────
                    SectionLabel(text = "REMINDER SCHEDULE")
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Reminders are sent automatically at these intervals",
                        fontFamily = InterFamily,
                        fontSize = 12.sp,
                        color = MutedGray,
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Schedule info cards
                    val scheduleItems = listOf(
                        "2 days before due date",
                        "1 day before due date",
                        "1 day after due date",
                        "3 days after due date",
                        "7 days after due date",
                        "15 days after due date",
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        scheduleItems.forEach { item ->
                            ScheduleItem(label = item)
                        }
                    }

                    Spacer(modifier = Modifier.height(28.dp))
                    AppDivider()
                    Spacer(modifier = Modifier.height(28.dp))

                    // ── Quiet Hours ────────────────────
                    SectionLabel(text = "QUIET HOURS")
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "No reminders will be sent during these hours (IST)",
                        fontFamily = InterFamily,
                        fontSize = 12.sp,
                        color = MutedGray,
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    // Start hour
                    QuietHourSlider(
                        label = "Don't send after",
                        value = state.quietHoursStart,
                        onValueChange = viewModel::onQuietHoursStartChange,
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    // End hour
                    QuietHourSlider(
                        label = "Resume sending from",
                        value = state.quietHoursEnd,
                        onValueChange = viewModel::onQuietHoursEndChange,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Summary
                    val startFormatted = formatHour(state.quietHoursStart)
                    val endFormatted = formatHour(state.quietHoursEnd)
                    InfoCard(
                        title = "Current quiet hours",
                        body = "$startFormatted — $endFormatted (IST)\n" +
                                "No automatic reminders during this time.",
                    )

                    Spacer(modifier = Modifier.height(32.dp))
                }
            }

            // ── When reminders are OFF ─────────────────
            AnimatedVisibility(
                visible = !state.remindersEnabled,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                Column {
                    Spacer(modifier = Modifier.height(16.dp))
                    InfoCard(
                        title = "Reminders are off",
                        body = "Turn on auto reminders to automatically " +
                                "notify clients about unpaid invoices. " +
                                "You can still send manual reminders from " +
                                "each invoice screen.",
                    )
                    Spacer(modifier = Modifier.height(32.dp))
                }
            }
        }
    }
}

// ── Components ─────────────────────────────────────────────

@Composable
private fun SettingsToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 16.dp)) {
            Text(
                text = title,
                fontFamily = InterFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                color = NearBlack,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtitle,
                fontFamily = InterFamily,
                fontSize = 12.sp,
                color = MutedGray,
                lineHeight = 16.sp,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = NearBlack,
                checkedTrackColor = Mint,
                uncheckedThumbColor = MutedGray,
                uncheckedTrackColor = BorderGray,
                uncheckedBorderColor = BorderGray,
            ),
        )
    }
}

@Composable
private fun ScheduleItem(label: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, BorderGray, RoundedCornerShape(6.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(Mint, RoundedCornerShape(3.dp)),
        )
        Text(
            text = label,
            fontFamily = InterFamily,
            fontSize = 13.sp,
            color = NearBlack,
        )
    }
}

@Composable
private fun QuietHourSlider(
    label: String,
    value: Int,
    onValueChange: (Int) -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                fontFamily = InterFamily,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                color = NearBlack,
            )
            Text(
                text = formatHour(value),
                fontFamily = InterFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                color = Mint,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Slider(
            value = value.toFloat(),
            onValueChange = { onValueChange(it.toInt()) },
            valueRange = 0f..23f,
            steps = 22,
            colors = SliderDefaults.colors(
                thumbColor = NearBlack,
                activeTrackColor = Mint,
                inactiveTrackColor = BorderGray,
            ),
        )
        // Hour labels
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "12 AM",
                fontFamily = InterFamily,
                fontSize = 10.sp,
                color = MutedGray,
            )
            Text(
                text = "12 PM",
                fontFamily = InterFamily,
                fontSize = 10.sp,
                color = MutedGray,
            )
            Text(
                text = "11 PM",
                fontFamily = InterFamily,
                fontSize = 10.sp,
                color = MutedGray,
            )
        }
    }
}

@Composable
private fun InfoCard(title: String, body: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(OffWhite, RoundedCornerShape(8.dp))
            .border(1.dp, BorderGray, RoundedCornerShape(8.dp))
            .padding(14.dp),
    ) {
        Text(
            text = title,
            fontFamily = InterFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            color = NearBlack,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = body,
            fontFamily = InterFamily,
            fontSize = 12.sp,
            color = MutedGray,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        color = MutedGray,
        letterSpacing = 0.8.sp,
    )
}

// Format hour int to readable string
private fun formatHour(hour: Int): String {
    return when {
        hour == 0 -> "12:00 AM"
        hour < 12 -> "$hour:00 AM"
        hour == 12 -> "12:00 PM"
        else -> "${hour - 12}:00 PM"
    }
}
Step 9 — Manual WhatsApp Reminder (Update InvoiceDetailScreen)
Update InvoiceDetailViewModel.kt — send WhatsApp message data
Kotlin

// Add to InvoiceDetailUiState
data class InvoiceDetailUiState(
    // ... existing fields ...
    val whatsAppMessage: String? = null,   // triggers WhatsApp intent
    val whatsAppPhone: String? = null,
)

// Add to InvoiceDetailViewModel
fun onSendWhatsAppReminder() {
    val invoice = _uiState.value.invoice ?: return

    // Build the message
    val clientFirstName = invoice.client.name.split(" ").first()
    val daysOverdue = Math.abs(
        com.freelanceflow.utils.daysUntilDue(invoice.dueDate)
    )

    val message = buildString {
        append("Hi $clientFirstName,\n\n")

        if (invoice.status == "OVERDUE") {
            append("This is a reminder that invoice *${invoice.invoiceNumber}* ")
            append("for *${invoice.total.toRupeesCompact()}* ")
            append("is now *${daysOverdue} days overdue*")
            append(" (due: ${invoice.dueDate.toDisplayDate()}).\n\n")
            append("Could you please process the payment?\n\n")
        } else {
            append("Friendly reminder that invoice *${invoice.invoiceNumber}* ")
            append("for *${invoice.total.toRupeesCompact()}* ")
            append("is due on *${invoice.dueDate.toDisplayDate()}*.\n\n")
        }

        // Add payment details if available
        // (fetched from user profile stored in the invoice or session)
        append("Thank you! 🙏")
    }

    _uiState.update {
        it.copy(
            whatsAppMessage = message,
            whatsAppPhone = invoice.client.phone,
        )
    }
}

fun onWhatsAppLaunched() {
    _uiState.update {
        it.copy(whatsAppMessage = null, whatsAppPhone = null)
    }
}
Update InvoiceDetailScreen.kt — handle WhatsApp intent
Kotlin

// In InvoiceDetailScreen composable — add this LaunchedEffect
LaunchedEffect(state.whatsAppMessage) {
    state.whatsAppMessage?.let { message ->
        val phone = state.whatsAppPhone?.filter { it.isDigit() } ?: ""

        val intent = if (phone.isNotEmpty()) {
            Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse(
                    "https://wa.me/91$phone?text=${Uri.encode(message)}"
                )
            }
        } else {
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                setPackage("com.whatsapp")
                putExtra(Intent.EXTRA_TEXT, message)
            }
        }

        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            // WhatsApp not installed
            val fallback = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, message)
            }
            context.startActivity(Intent.createChooser(fallback, "Send Reminder"))
        }

        viewModel.onWhatsAppLaunched()
    }
}

// Update the "Send Reminder" button in ActionButtons to call
// viewModel::onSendWhatsAppReminder instead of viewModel::sendReminder
// sendReminder still fires for the email (server-side)
// onSendWhatsAppReminder fires for WhatsApp (device-side)

// Update ActionButtons — SENT / OVERDUE case:
InvoiceStatus.SENT, InvoiceStatus.OVERDUE -> {
    PrimaryButton(
        text = "Mark as Paid ✓",
        onClick = onMarkPaid,
    )
    SecondaryButton(
        text = "Send WhatsApp Reminder",
        onClick = onWhatsAppReminder,     // ← new
    )
    SecondaryButton(
        text = if (isSendingReminder) "Sending..." else "Send Email Reminder",
        onClick = onSendReminder,          // ← email only now
        enabled = !isSendingReminder,
    )
}
Step 10 — Wire Reminder Settings into Navigation
Update MainScreen.kt — add reminder settings route
Kotlin

// Add this route inside the NavHost in MainScreen.kt
composable("settings/reminders") {
    ReminderSettingsScreen(
        onBack = { navController.popBackStack() },
    )
}
Update SettingsScreen.kt — add navigation to reminder settings
Kotlin

// Replace the placeholder SettingsScreen with this
package com.freelanceflow.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.freelanceflow.ui.components.AppDivider
import com.freelanceflow.ui.components.AppTopBar
import com.freelanceflow.ui.components.GhostButton
import com.freelanceflow.ui.theme.BorderGray
import com.freelanceflow.ui.theme.ErrorRed
import com.freelanceflow.ui.theme.InterFamily
import com.freelanceflow.ui.theme.Mint
import com.freelanceflow.ui.theme.MutedGray
import com.freelanceflow.ui.theme.NearBlack
import com.freelanceflow.ui.theme.OffWhite
import com.freelanceflow.ui.theme.White

@Composable
fun SettingsScreen(
    onLogout: () -> Unit,
    onNavigateToReminders: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(White)
            .systemBarsPadding(),
    ) {
        AppTopBar(title = "Settings")
        AppDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            // ── Section: Notifications ─────────────────
            SettingsSectionLabel(text = "NOTIFICATIONS")
            Spacer(modifier = Modifier.height(12.dp))

            SettingsNavRow(
                icon = {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = null,
                        tint = Mint,
                    )
                },
                title = "Reminders",
                subtitle = "Auto payment reminders for clients",
                onClick = onNavigateToReminders,
            )

            Spacer(modifier = Modifier.height(32.dp))
            AppDivider()
            Spacer(modifier = Modifier.height(32.dp))

            // ── Account ────────────────────────────────
            SettingsSectionLabel(text = "ACCOUNT")
            Spacer(modifier = Modifier.height(16.dp))

            GhostButton(
                text = "Sign Out",
                onClick = onLogout,
                color = ErrorRed,
            )

            Spacer(modifier = Modifier.height(48.dp))

            // App version
            Text(
                text = "FreelanceFlow v1.0.0",
                fontFamily = InterFamily,
                fontSize = 11.sp,
                color = MutedGray,
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SettingsSectionLabel(text: String) {
    Text(
        text = text,
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        color = MutedGray,
        letterSpacing = 0.8.sp,
    )
}

@Composable
private fun SettingsNavRow(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, BorderGray, RoundedCornerShape(8.dp))
            .background(OffWhite, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            icon()
            Column {
                Text(
                    text = title,
                    fontFamily = InterFamily,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = NearBlack,
                )
                Text(
                    text = subtitle,
                    fontFamily = InterFamily,
                    fontSize = 12.sp,
                    color = MutedGray,
                )
            }
        }
        Icon(
            imageVector = Icons.Default.ArrowForward,
            contentDescription = null,
            tint = MutedGray,
        )
    }
}
Update Settings route in MainScreen.kt
Kotlin

// Update settings composable to pass navigation
composable("settings") {
    SettingsScreen(
        onLogout = onLogout,
        onNavigateToReminders = {
            navController.navigate("settings/reminders")
        },
    )
}