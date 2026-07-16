import { prisma } from '../config/database'

export const generateInvoiceNumber = async (
  userId: string,
  prefix: string
): Promise<string> => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { invoiceCount: { increment: 1 } },
      select: { invoiceCount: true },
    })

    const year = new Date().getFullYear()
    const paddedCount = String(user.invoiceCount).padStart(4, '0')
    const cleanPrefix = prefix.trim().toUpperCase() || 'INV'

    return `${cleanPrefix}-${year}-${paddedCount}`
  })
}
