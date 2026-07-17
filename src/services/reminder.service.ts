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

  return `Hi ${clientFirstName},

This is an important reminder that invoice *${invoice.invoiceNumber}* for *${amount}* from ${businessName} is now *${daysOverdue} days overdue*.

Kindly process the payment immediately or contact us to discuss.

Thank you!`
}

// ── Check if quiet hours for a user ────────────────────────
const isQuietHours = (
  quietHoursStart: number,
  quietHoursEnd: number,
): boolean => {
  const nowHour = new Date().getHours()  // IST hour (server must be IST or local timezone adjusted)

  if (quietHoursStart > quietHoursEnd) {
    // Overnight quiet hours (e.g., 21 to 9)
    return nowHour >= quietHoursStart || nowHour < quietHoursEnd
  } else {
    // Same-day quiet hours
    return nowHour >= quietHoursStart && nowHour < quietHoursEnd
  }
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

  // Send email reminder if client has email and user has email reminders enabled
  if (invoice.client.email && user.reminderEmailEnabled) {
    try {
      await emailService.sendPaymentReminder(invoice, invoice.client)
      emailSent = true
    } catch (error: any) {
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
  if (invoice.client.phone) {
    await prisma.reminderLog.create({
      data: {
        invoiceId: invoice.id,
        channel: 'WHATSAPP',
        status: 'PENDING',
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

      if (invoices.length > 0) {
        console.log(
          `[${rule.name}] Found ${invoices.length} invoice(s) to remind`
        )
      }

      // Process each invoice
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
