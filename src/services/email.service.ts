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

  public async sendOtp(to: string, code: string): Promise<void> {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your Email</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; padding: 24px; margin: 0;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #EAEAEA; border-radius: 8px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin-top: 0;">Verify your email</h2>
        <p style="color: #6B6B6B; font-size: 14px; line-height: 20px;">
          Thanks for signing up for FreelanceFlow! Use the following verification code to complete your registration. This code is valid for 10 minutes.
        </p>
        <div style="background-color: #F1F3F5; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #000000; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #9E9E9E; font-size: 12px; line-height: 18px; margin-bottom: 0;">
          If you didn't request this verification code, you can safely ignore this email.
        </p>
      </div>
    </body>
    </html>
    `
    await this.sendEmail(to, 'Verify Your Email Address — FreelanceFlow', html)
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freelancerflow.work.gd'

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
    const user = invoice.user || {}
    
    // Format line items
    const itemsHtml = (invoice.lineItems || []).map((item: any) => `
      <tr style="border-bottom: 1px solid #EAEAEA;">
        <td style="padding: 12px 8px; text-align: left; font-size: 14px; color: #333;">${item.description}</td>
        <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #666;">${item.quantity}</td>
        <td style="padding: 12px 8px; text-align: right; font-size: 14px; color: #666;">₹${item.rate.toLocaleString('en-IN')}</td>
        <td style="padding: 12px 8px; text-align: right; font-size: 14px; color: #333; font-weight: bold;">₹${item.amount.toLocaleString('en-IN')}</td>
      </tr>
    `).join('')

    // Format payment instructions
    let paymentInstructions = ''
    if (user.upiId || (user.bankAccountNumber && user.bankIfsc)) {
      paymentInstructions = `
        <div style="margin-top: 30px; padding: 20px; background-color: #F8F9FA; border-left: 4px solid #00E5A0; border-radius: 4px;">
          <h4 style="margin: 0 0 10px 0; color: #0A0A0A; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Instructions</h4>
      `
      if (user.upiId) {
        paymentInstructions += `<p style="margin: 5px 0; font-size: 14px; color: #444;"><strong>UPI ID (GPay/PhonePe/Paytm):</strong> ${user.upiId}</p>`
      }
      if (user.bankAccountNumber && user.bankIfsc) {
        paymentInstructions += `
          <p style="margin: 5px 0; font-size: 14px; color: #444; line-height: 1.4;">
            <strong>Bank Transfer Details:</strong><br>
            Bank Name: ${user.bankName || 'N/A'}<br>
            Account Name: ${user.bankAccountName || user.name}<br>
            Account Number: ${user.bankAccountNumber}<br>
            IFSC Code: ${user.bankIfsc}
          </p>
        `
      }
      paymentInstructions += `</div>`
    }

    const html = `
      <div style="background-color: #F4F6F8; padding: 30px 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #EAEAEA;">
          
          <!-- Header Banner -->
          <div style="text-align: center; background-color: #F4F6F8;">
            <img src="https://freelancerinvoiceautomation.onrender.com/uploads/email_banner_success.png" alt="FreelanceFlow" style="width: 100%; max-width: 600px; display: block; border-bottom: 4px solid #00E5A0;" />
          </div>
          <div style="background-color: #0A0A0A; padding: 20px 24px; text-align: center;">
            <h1 style="color: #00E5A0; margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">${user.businessName || user.name || 'Invoice Notification'}</h1>
            ${user.businessName ? `<p style="color: #8E8E93; margin: 5px 0 0 0; font-size: 13px;">${user.name}</p>` : ''}
          </div>

          <div style="padding: 24px;">
            <p style="margin-top: 0; font-size: 16px; color: #333;">Dear <strong>${client.name}</strong>,</p>
            <p style="font-size: 14px; color: #555; margin-bottom: 24px;">An invoice has been generated for recent services. Please find the summary and payment details below:</p>

            <!-- Invoice Summary Card -->
            <div style="background: linear-gradient(135deg, #0A0A0A, #1A1A1A); padding: 20px; border-radius: 6px; color: #FFFFFF; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0; font-size: 11px; color: #8E8E93; text-transform: uppercase;">Invoice Number</td>
                  <td style="padding: 0; font-size: 11px; color: #8E8E93; text-transform: uppercase; text-align: right;">Total Amount Due</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0 12px 0; font-size: 18px; font-weight: bold; color: #FFFFFF;">${invoice.invoiceNumber}</td>
                  <td style="padding: 4px 0 12px 0; font-size: 22px; font-weight: bold; color: #00E5A0; text-align: right;">₹${invoice.total.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0 0 0; font-size: 11px; color: #8E8E93; text-transform: uppercase; border-top: 1px solid #333;">Due Date</td>
                  <td style="padding: 12px 0 0 0; font-size: 11px; color: #8E8E93; text-transform: uppercase; text-align: right; border-top: 1px solid #333;">Issue Date</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0 0 0; font-size: 14px; color: #FF4444; font-weight: bold;">${invoice.dueDate.toISOString().split('T')[0]}</td>
                  <td style="padding: 4px 0 0 0; font-size: 14px; color: #FFFFFF; text-align: right;">${invoice.issueDate.toISOString().split('T')[0]}</td>
                </tr>
              </table>
            </div>

            <!-- Line Items Table -->
            <h3 style="margin: 0 0 12px 0; font-size: 13px; color: #0A0A0A; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #00E5A0; padding-bottom: 6px;">Line Items</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <thead>
                <tr style="background-color: #F8F9FA;">
                  <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Description</th>
                  <th style="padding: 10px 8px; text-align: center; font-size: 12px; color: #666; text-transform: uppercase; width: 60px;">Qty</th>
                  <th style="padding: 10px 8px; text-align: right; font-size: 12px; color: #666; text-transform: uppercase; width: 100px;">Rate</th>
                  <th style="padding: 10px 8px; text-align: right; font-size: 12px; color: #666; text-transform: uppercase; width: 100px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Financial Summary -->
            <div style="width: 250px; margin-left: auto; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #666;">Subtotal:</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #333; text-align: right;">₹${invoice.subtotal.toLocaleString('en-IN')}</td>
                </tr>
                ${invoice.gstAmount > 0 ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #666;">GST (${invoice.gstPercentage}%):</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #333; text-align: right;">₹${invoice.gstAmount.toLocaleString('en-IN')}</td>
                </tr>
                ` : ''}
                <tr style="border-top: 1px solid #EAEAEA;">
                  <td style="padding: 10px 0; font-size: 15px; font-weight: bold; color: #0A0A0A;">Total Amount:</td>
                  <td style="padding: 10px 0; font-size: 18px; font-weight: bold; color: #00E5A0; text-align: right;">₹${invoice.total.toLocaleString('en-IN')}</td>
                </tr>
              </table>
            </div>

            <!-- Notes Section -->
            ${invoice.notes ? `
            <div style="margin-top: 20px; padding: 15px; background-color: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 4px;">
              <h4 style="margin: 0 0 5px 0; color: #555; font-size: 13px; text-transform: uppercase;">Notes</h4>
              <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.4;">${invoice.notes}</p>
            </div>
            ` : ''}

            <!-- Payment Instructions -->
            ${paymentInstructions}

            <p style="margin-top: 30px; margin-bottom: 0; font-size: 13px; color: #8E8E93; text-align: center; line-height: 1.4;">
              If you have any questions regarding this invoice, please contact the sender directly.<br>
              Thank you for your business!
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #F8F9FA; padding: 16px; text-align: center; border-top: 1px solid #EAEAEA;">
            <p style="margin: 0; font-size: 12px; color: #AEAEB2;">
              Sent via <strong>FreelanceFlow</strong> - Professional Invoicing for Freelancers.
            </p>
          </div>

        </div>
      </div>
    `
    await this.sendEmail(client.email, `Invoice ${invoice.invoiceNumber} from ${user.businessName || user.name || 'Freelancer'}`, html)
  }

  async sendPaymentReminder(invoice: any, client: any): Promise<void> {
    const user = invoice.user || {}
    
    // Format payment instructions
    let paymentInstructions = ''
    if (user.upiId || (user.bankAccountNumber && user.bankIfsc)) {
      paymentInstructions = `
        <div style="margin-top: 30px; padding: 20px; background-color: #F8F9FA; border-left: 4px solid #FF4444; border-radius: 4px;">
          <h4 style="margin: 0 0 10px 0; color: #0A0A0A; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Details</h4>
      `
      if (user.upiId) {
        paymentInstructions += `<p style="margin: 5px 0; font-size: 14px; color: #444;"><strong>UPI ID (GPay/PhonePe/Paytm):</strong> ${user.upiId}</p>`
      }
      if (user.bankAccountNumber && user.bankIfsc) {
        paymentInstructions += `
          <p style="margin: 5px 0; font-size: 14px; color: #444; line-height: 1.4;">
            <strong>Bank Transfer Details:</strong><br>
            Bank Name: ${user.bankName || 'N/A'}<br>
            Account Name: ${user.bankAccountName || user.name}<br>
            Account Number: ${user.bankAccountNumber}<br>
            IFSC Code: ${user.bankIfsc}
          </p>
        `
      }
      paymentInstructions += `</div>`
    }

    const html = `
      <div style="background-color: #F4F6F8; padding: 30px 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #EAEAEA;">
          
          <!-- Header Banner -->
          <div style="background-color: #FF4444; padding: 20px; text-align: center;">
            <h2 style="color: #FFFFFF; margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">Payment Reminder</h2>
            <p style="color: rgba(255, 255, 255, 0.8); margin: 5px 0 0 0; font-size: 13px;">${user.businessName || user.name || 'Invoice Notification'}</p>
          </div>

          <div style="padding: 24px;">
            <p style="margin-top: 0; font-size: 16px; color: #333;">Dear <strong>${client.name}</strong>,</p>
            <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 24px;">
              This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> is currently outstanding. Please find a summary of the due payment below:
            </p>

            <!-- Reminder Highlights Card -->
            <div style="background-color: #FDF2F2; border: 1px solid #FDE8E8; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0; font-size: 11px; color: #777; text-transform: uppercase;">Invoice Number</td>
                  <td style="padding: 0; font-size: 11px; color: #777; text-transform: uppercase; text-align: right;">Amount Outstanding</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0 12px 0; font-size: 18px; font-weight: bold; color: #0A0A0A;">${invoice.invoiceNumber}</td>
                  <td style="padding: 4px 0 12px 0; font-size: 22px; font-weight: bold; color: #FF4444; text-align: right;">₹${invoice.total.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="border-top: 1px solid #FDE8E8;">
                  <td style="padding: 12px 0 0 0; font-size: 11px; color: #777; text-transform: uppercase;">Due Date</td>
                  <td style="padding: 12px 0 0 0; font-size: 11px; color: #777; text-transform: uppercase; text-align: right;">Status</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0 0 0; font-size: 14px; color: #FF4444; font-weight: bold;">${invoice.dueDate.toISOString().split('T')[0]}</td>
                  <td style="padding: 4px 0 0 0; font-size: 12px; font-weight: bold; color: #D9534F; text-align: right; text-transform: uppercase; letter-spacing: 0.5px;">OVERDUE</td>
                </tr>
              </table>
            </div>

            <!-- Call to Action -->
            <p style="font-size: 14px; color: #555; line-height: 1.6;">
              Please complete your payment at your earliest convenience using the details provided below. Thank you for your business!
            </p>

            <!-- Payment Instructions -->
            ${paymentInstructions}

            <p style="margin-top: 30px; margin-bottom: 0; font-size: 13px; color: #8E8E93; text-align: center; line-height: 1.4;">
              If you have already made this payment, please disregard this email.<br>
              Thank you!
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #F8F9FA; padding: 16px; text-align: center; border-top: 1px solid #EAEAEA;">
            <p style="margin: 0; font-size: 12px; color: #AEAEB2;">
              Sent via <strong>FreelanceFlow</strong> - Professional Invoicing for Freelancers.
            </p>
          </div>

        </div>
      </div>
    `
    await this.sendEmail(client.email, `Reminder: Invoice ${invoice.invoiceNumber} is outstanding`, html)
  }

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
    <body style="font-family:Arial,sans-serif;background:#F9F9F9;margin:0;padding:40px 20px">
      <div style="max-width:500px;margin:0 auto;background:#FFFFFF;border:1px solid #E4E4E4;border-radius:8px;padding:32px">
        <div style="font-size:18px;font-weight:700;color:#FF4444;margin-bottom:16px">
          ⚠️ Invoice Overdue — ${daysOverdue} Days
        </div>
        <p style="color:#6B6B6B;font-size:14px;line-height:1.6">
          Hi ${user.name},
        </p>
        <p style="color:#6B6B6B;font-size:14px;line-height:1.6">
          Your invoice <strong>${invoice.invoiceNumber}</strong> from <strong>${invoice.client.name}</strong> is now <strong style="color:#FF4444">${daysOverdue} days overdue</strong>.
        </p>
        <div style="background:#FFF5F5;border:1px solid #FFCCCC;border-radius:6px;padding:16px;margin:20px 0">
          <div style="font-size:12px;color:#6B6B6B">Outstanding Amount</div>
          <div style="font-size:28px;font-weight:700;color:#FF4444">${formatRupeesLocal(invoice.total)}</div>
          <div style="font-size:12px;color:#6B6B6B;margin-top:6px">
            Client: ${invoice.client.name}
          </div>
          ${invoice.client.phone ? `<div style="font-size:12px;color:#6B6B6B">Phone: ${invoice.client.phone}</div>` : ''}
          ${invoice.client.email ? `<div style="font-size:12px;color:#6B6B6B">Email: ${invoice.client.email}</div>` : ''}
        </div>
        <p style="color:#6B6B6B;font-size:13px">
          We've already sent automatic reminders to your client. You may want to follow up directly.
        </p>
        <p style="color:#6B6B6B;font-size:13px;margin-top:16px">
          — FreelanceFlow
        </p>
      </div>
    </body>
    </html>
    `

    await this.sendEmail(
      user.email,
      `⚠️ ${daysOverdue} Days Overdue — ${invoice.client.name} (${invoice.invoiceNumber})`,
      html
    )
  }
}

export const emailService = new EmailService()
