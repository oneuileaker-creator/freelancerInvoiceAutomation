import PDFDocument from 'pdfkit'
import { Response } from 'express'

export const generateInvoicePdf = (invoice: any, res: Response): void => {
  const doc = new PDFDocument({ margin: 50 })

  // Pipe the PDF document directly to the express response
  doc.pipe(res)

  // ── Branding Header ─────────────────────────────────────
  doc.fillColor('#0A0A0A').fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'right' })
  doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica').text(`Invoice #: ${invoice.invoice_number}`, { align: 'right' })
  doc.text(`Issue Date: ${invoice.issue_date}`, { align: 'right' })
  doc.text(`Due Date: ${invoice.due_date}`, { align: 'right' })
  doc.moveDown(2)

  // ── Address Blocks ──────────────────────────────────────
  const billingTop = doc.y

  // From Freelancer (User)
  doc.fillColor('#0A0A0A').fontSize(12).font('Helvetica-Bold').text('FROM:', 50, billingTop)
  doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')
  doc.text(invoice.user?.name || 'Freelancer')
  if (invoice.user?.businessName) doc.text(invoice.user.businessName)
  if (invoice.user?.address) doc.text(invoice.user.address)
  if (invoice.user?.phone) doc.text(`Phone: ${invoice.user.phone}`)

  // To Client
  doc.fillColor('#0A0A0A').fontSize(12).font('Helvetica-Bold').text('TO:', 320, billingTop)
  doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')
  doc.text(invoice.client.name, 320)
  if (invoice.client.address) doc.text(invoice.client.address)
  if (invoice.client.email) doc.text(`Email: ${invoice.client.email}`)
  if (invoice.client.phone) doc.text(`Phone: ${invoice.client.phone}`)

  doc.moveDown(3)

  // ── Line Items Table ────────────────────────────────────
  doc.fillColor('#0A0A0A').fontSize(12).font('Helvetica-Bold')
  doc.text('Item Description', 50, doc.y)
  doc.text('Qty', 300, doc.y, { width: 40, align: 'right' })
  doc.text('Rate', 360, doc.y, { width: 80, align: 'right' })
  doc.text('Amount', 460, doc.y, { width: 80, align: 'right' })

  // Divider Line
  doc.moveDown(0.5)
  doc.strokeColor('#E4E4E4').lineWidth(1).moveTo(50, doc.y).lineTo(540, doc.y).stroke()
  doc.moveDown(0.8)

  doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')
  invoice.line_items.forEach((item: any) => {
    const itemY = doc.y
    doc.text(item.description, 50, itemY, { width: 230 })
    doc.text(String(item.quantity), 300, itemY, { width: 40, align: 'right' })
    doc.text(`INR ${item.rate.toLocaleString('en-IN')}`, 360, itemY, { width: 80, align: 'right' })
    doc.text(`INR ${item.amount.toLocaleString('en-IN')}`, 460, itemY, { width: 80, align: 'right' })
    doc.moveDown(1.5)
  })

  // Divider Line
  doc.strokeColor('#E4E4E4').lineWidth(1).moveTo(50, doc.y).lineTo(540, doc.y).stroke()
  doc.moveDown(1)

  // ── Totals block ────────────────────────────────────────
  const totalsY = doc.y
  doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')
  doc.text('Subtotal:', 360, totalsY, { width: 80, align: 'right' })
  doc.text(`INR ${invoice.subtotal.toLocaleString('en-IN')}`, 460, totalsY, { width: 80, align: 'right' })

  if (invoice.gst_percentage > 0) {
    doc.text(`GST (${invoice.gst_percentage}%):`, 360, doc.y + 15, { width: 80, align: 'right' })
    doc.text(`INR ${invoice.gst_amount.toLocaleString('en-IN')}`, 460, doc.y, { width: 80, align: 'right' })
  }

  doc.moveDown(1.5)
  doc.fillColor('#0A0A0A').fontSize(12).font('Helvetica-Bold')
  doc.text('Total:', 360, doc.y, { width: 80, align: 'right' })
  doc.text(`INR ${invoice.total.toLocaleString('en-IN')}`, 460, doc.y, { width: 80, align: 'right' })

  // ── Bank Payment Details ────────────────────────────────
  if (invoice.user?.upiId || invoice.user?.bankAccountNumber) {
    doc.moveDown(3)
    doc.fillColor('#0A0A0A').fontSize(12).font('Helvetica-Bold').text('PAYMENT DETAILS', 50, doc.y)
    doc.strokeColor('#00E5A0').lineWidth(2).moveTo(50, doc.y).lineTo(150, doc.y).stroke()
    doc.moveDown(0.8)
    doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')

    if (invoice.user?.upiId) {
      doc.text(`UPI VPA: ${invoice.user.upiId}`)
    }
    if (invoice.user?.bankAccountNumber) {
      doc.text(`Bank Name: ${invoice.user.bankName || ''}`)
      doc.text(`Account Holder: ${invoice.user.bankAccountName || ''}`)
      doc.text(`Account Number: ${invoice.user.bankAccountNumber}`)
      doc.text(`IFSC Code: ${invoice.user.bankIfsc || ''}`)
    }
  }

  // ── Notes ───────────────────────────────────────────────
  if (invoice.notes) {
    doc.moveDown(2)
    doc.fillColor('#0A0A0A').fontSize(10).font('Helvetica-Bold').text('NOTES', 50, doc.y)
    doc.fillColor('#6B6B6B').fontSize(9).font('Helvetica').text(invoice.notes)
  }

  // End the document
  doc.end()
}
