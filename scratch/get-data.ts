import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Connecting to database...')
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true }
  })
  console.log('Users:', users)

  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, total: true, client: { select: { email: true } } }
  })
  console.log('Invoices:', invoices)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
