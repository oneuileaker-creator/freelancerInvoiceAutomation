import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching reminder logs...')
  const logs = await prisma.reminderLog.findMany({
    include: {
      invoice: {
        include: {
          client: true
        }
      }
    },
    orderBy: {
      sentAt: 'desc'
    },
    take: 10
  })

  console.log('--- Reminder Log Details ---')
  for (const log of logs) {
    console.log(`Log ID: ${log.id}`)
    console.log(`Sent At: ${log.sentAt}`)
    console.log(`Status: ${log.status}`)
    console.log(`Invoice Number: ${log.invoice.invoiceNumber}`)
    console.log(`Client Name: ${log.invoice.client.name}`)
    console.log(`Client Email: ${log.invoice.client.email}`)
    console.log('-----------------------------')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
