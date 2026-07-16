import nodemailer from 'nodemailer'

class EmailService {
  private transporter: nodemailer.Transporter

  constructor() {
    const port = parseInt(process.env.SMTP_PORT || '2525')
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
      port: port,
      secure: port === 465, // true for port 465, false for others
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    })
  }

  async sendPasswordReset(email: string, name: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freelanceflow.app',
      to: email,
      subject: `Password Reset for ${process.env.APP_NAME || 'FreelanceFlow'}`,
      html: `
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
      `,
    }

    await this.transporter.sendMail(mailOptions)
  }

  async sendInvoiceToClient(invoice: any, client: any): Promise<void> {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freelanceflow.app',
      to: client.email,
      subject: `Invoice ${invoice.invoiceNumber} from Freelancer`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Dear ${client.name},</h2>
          <p>An invoice has been generated for your recent project/services. Details are provided below:</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr style="background-color: #F4F4F4;">
              <th style="padding: 10px; border: 1.dp solid #E4E4E4; text-align: left;">Invoice Number</th>
              <td style="padding: 10px; border: 1.dp solid #E4E4E4;">${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <th style="padding: 10px; border: 1.dp solid #E4E4E4; text-align: left;">Total Due</th>
              <td style="padding: 10px; border: 1.dp solid #E4E4E4; font-weight: bold;">INR ${invoice.total.toLocaleString('en-IN')}</td>
            </tr>
            <tr style="background-color: #F4F4F4;">
              <th style="padding: 10px; border: 1.dp solid #E4E4E4; text-align: left;">Due Date</th>
              <td style="padding: 10px; border: 1.dp solid #E4E4E4; color: #FF4444;">${invoice.dueDate.toISOString().split('T')[0]}</td>
            </tr>
          </table>
          <p style="margin-top: 20px;">Please make the payment within the due date using the payment instructions provided. Thank you!</p>
          <br>
          <p>Best regards,</p>
          <p>FreelanceFlow Notification Service</p>
        </div>
      `,
    }

    await this.transporter.sendMail(mailOptions)
  }

  async sendPaymentReminder(invoice: any, client: any): Promise<void> {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freelanceflow.app',
      to: client.email,
      subject: `Reminder: Invoice ${invoice.invoiceNumber} is outstanding`,
      html: `
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
      `,
    }

    await this.transporter.sendMail(mailOptions)
  }
}

export const emailService = new EmailService()
