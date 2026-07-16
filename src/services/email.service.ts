import nodemailer from 'nodemailer'

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private brevoApiKey: string | null = null
  private resendApiKey: string | null = null

  constructor() {
    this.brevoApiKey = process.env.BREVO_API_KEY || null
    this.resendApiKey = process.env.RESEND_API_KEY || null

    // Only initialize SMTP transporter if no HTTP API Key is set
    if (!this.brevoApiKey && !this.resendApiKey) {
      const port = parseInt(process.env.SMTP_PORT || '2525')
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
        port: port,
        secure: port === 465, // true for port 465, false for others
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
        connectionTimeout: 10000, // 10s connection timeout
        greetingTimeout: 10000,   // 10s greeting timeout
        socketTimeout: 10000,     // 10s socket timeout
      })
    }
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freelanceflow.app'

    // 1. Try Brevo HTTP API
    if (this.brevoApiKey) {
      console.log('Sending email via Brevo HTTP API...')
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: from,
            name: process.env.APP_NAME || 'FreelanceFlow',
          },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Brevo API Error: ${response.status} - ${errText}`)
      }
      console.log('Email sent successfully via Brevo API')
      return
    }

    // 2. Try Resend HTTP API
    if (this.resendApiKey) {
      console.log('Sending email via Resend HTTP API...')
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: from,
          to: to,
          subject: subject,
          html: html,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Resend API Error: ${response.status} - ${errText}`)
      }
      console.log('Email sent successfully via Resend API')
      return
    }

    // 3. Fallback to standard SMTP (Nodemailer)
    if (this.transporter) {
      console.log('Sending email via SMTP...')
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      })
      console.log('Email sent successfully via SMTP')
      return
    }

    throw new Error('Email service is not configured (neither BREVO_API_KEY, RESEND_API_KEY, nor SMTP settings found)')
  }

  async sendPasswordReset(email: string, name: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hello ${name},</h2>
        <p>We received a request to reset your password. Click the button below to choose a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #00E5A0; color: #0A0A0A; text-decoration: none; font-weight: bold; border-radius: 4px;">Reset Password</a>
        <p>This reset link will expire in 1 hour.</p>
        <p>If you did not make this request, please ignore this email.</p>
        <br>
        <p>Best regards,</p>
        <p>The ${process.env.APP_NAME || 'FreelanceFlow'} Team</p>
      </div>
    `
    await this.sendEmail(email, `Password Reset for ${process.env.APP_NAME || 'FreelanceFlow'}`, html)
  }

  async sendInvoiceToClient(invoice: any, client: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Dear ${client.name},</h2>
        <p>An invoice has been generated for your recent project/services. Details are provided below:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #F4F4F4;">
            <th style="padding: 10px; border: 1px solid #E4E4E4; text-align: left;">Invoice Number</th>
            <td style="padding: 10px; border: 1px solid #E4E4E4;">${invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #E4E4E4; text-align: left;">Total Due</th>
            <td style="padding: 10px; border: 1px solid #E4E4E4; font-weight: bold;">INR ${invoice.total.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="background-color: #F4F4F4;">
            <th style="padding: 10px; border: 1px solid #E4E4E4; text-align: left;">Due Date</th>
            <td style="padding: 10px; border: 1px solid #E4E4E4; color: #FF4444;">${invoice.dueDate.toISOString().split('T')[0]}</td>
          </tr>
        </table>
        <p style="margin-top: 20px;">Please make the payment within the due date using the payment instructions provided. Thank you!</p>
        <br>
        <p>Best regards,</p>
        <p>FreelanceFlow Notification Service</p>
      </div>
    `
    await this.sendEmail(client.email, `Invoice ${invoice.invoiceNumber} from Freelancer`, html)
  }

  async sendPaymentReminder(invoice: any, client: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Dear ${client.name},</h2>
        <p>This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> is currently outstanding.</p>
        <p>Total Outstanding Amount: <strong>INR ${invoice.total.toLocaleString('en-IN')}</strong></p>
        <p>Due Date: <strong>${invoice.dueDate.toISOString().split('T')[0]}</strong></p>
        <p>Please complete your payment as soon as possible. Thank you for your business!</p>
        <br>
        <p>Best regards,</p>
        <p>FreelanceFlow Billing Team</p>
      </div>
    `
    await this.sendEmail(client.email, `Reminder: Invoice ${invoice.invoiceNumber} is outstanding`, html)
  }
}

export const emailService = new EmailService()
