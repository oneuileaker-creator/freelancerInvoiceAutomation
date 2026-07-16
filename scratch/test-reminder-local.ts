import { PrismaClient } from '@prisma/client'
import { emailService } from '../src/services/email.service'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching invoice...')
  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber: 'INV-2026-0002' },
    include: { client: true }
  })

  if (!invoice) {
    console.error('Invoice not found')
    return
  }

  console.log(`Found Invoice: ${invoice.invoiceNumber}, Client Email: ${invoice.client.email}`)

  if (!invoice.client.email) {
    console.error('Client has no email')
    return
  }

  console.log('Sending test email via local configuration...')
  await emailService.sendPaymentReminder(invoice, invoice.client)
  console.log('Email sent successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
