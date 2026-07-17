import dotenv from 'dotenv'
dotenv.config()

async function testSend() {
  const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS

  if (!apiKey || apiKey === 'YOUR_BREVO_SMTP_KEY_HERE') {
    console.error('❌ Error: Please put your Brevo SMTP/API key in the freelanceflow-backend/.env file under BREVO_API_KEY or SMTP_PASS first!')
    return
  }

  const recipients = ['oneuileaker@gmail.com', 'ankitjaat3172@gmail.com']
  console.log('Using API Key:', apiKey.substring(0, 10) + '...')

  for (const recipient of recipients) {
    console.log(`Sending test email to ${recipient}...`)
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: 'b24125001@smtp-brevo.com',
            name: 'FreelanceFlow Test',
          },
          to: [{ email: recipient }],
          subject: 'FreelanceFlow - Direct Delivery Test Email',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
              <h2>Direct Delivery Test Success!</h2>
              <p>This is a direct test email sent to verify that Brevo delivers successfully to your inbox.</p>
              <p>Recipient: <strong>${recipient}</strong></p>
              <br>
              <p>Best regards,</p>
              <p>FreelanceFlow Dev Team</p>
            </div>
          `,
        }),
      })

      const data = await response.json() as any
      if (response.ok) {
        console.log(`✅ Success for ${recipient}! Message ID:`, data.messageId)
      } else {
        console.error(`❌ Failed for ${recipient}:`, data)
      }
    } catch (error: any) {
      console.error(`❌ Request error for ${recipient}:`, error.message)
    }
  }
}

testSend()
