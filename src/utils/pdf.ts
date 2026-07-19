import PDFDocument from 'pdfkit'

// Format helpers
const formatRupees = (amount: number): string => {
  return `Rs. ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

const formatDate = (dateStr: string | Date): string => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ── Generate PDF buffer using PDFKit ──────────────────────────
export const generateInvoicePdf = (
  invoice: any,
  user: any
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (err) => reject(err))

      // Colors
      const primaryColor = '#0A0A0A'
      const secondaryColor = '#555555'
      const mintColor = '#00D084'
      const lightGray = '#F5F5F5'
      const borderGray = '#E0E0E0'

      const statusColors: Record<string, string> = {
        DRAFT: '#6B6B6B',
        SENT: '#F5A623',
        PAID: '#00D084',
        OVERDUE: '#FF4444',
      }
      const statusColor = statusColors[invoice.status] || '#6B6B6B'

      let y = 40

      // ── Header: Freelancer Info ──────────────────────────
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(18)
         .text(user.businessName || user.name, 40, y)
      
      y += 22

      doc.font('Helvetica')
         .fontSize(9)
         .fillColor(secondaryColor)

      if (user.businessName && user.name) {
        doc.text(user.name, 40, y)
        y += 12
      }
      doc.text(user.email, 40, y)
      y += 12
      if (user.phone) {
        doc.text(user.phone, 40, y)
        y += 12
      }
      if (user.address) {
        doc.text(user.address, 40, y)
        y += 12
      }
      if (user.gstin) {
        doc.text(`GSTIN: ${user.gstin}`, 40, y)
        y += 12
      }

      // ── Header Right: Invoice details ─────────────────────
      let rightY = 40
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(24)
         .text('INVOICE', 350, rightY, { width: 205, align: 'right' })
      
      rightY += 28

      doc.font('Helvetica-Bold')
         .fontSize(10)
         .fillColor(secondaryColor)
         .text(invoice.invoice_number, 350, rightY, { width: 205, align: 'right' })
      
      rightY += 16

      // Status Badge
      doc.save()
         .roundedRect(485, rightY, 70, 18, 4)
         .fill(`${statusColor}18`) // light transparency using Hex+Opacity (handled as fallback or pure hex fill)
         .restore()

      doc.fillColor(statusColor)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text(invoice.status, 485, rightY + 4, { width: 70, align: 'center' })

      // PAID stamp watermark for Pro users/verification
      if (invoice.status === 'PAID') {
        const fs = require('fs')
        const path = require('path')
        const watermarkPath = path.join(process.cwd(), 'uploads', 'pdf_watermark_paid.png')
        if (fs.existsSync(watermarkPath)) {
          doc.save()
          doc.opacity(0.85)
          doc.image(watermarkPath, 340, rightY - 5, { width: 55 })
          doc.restore()
        }
      }

      y = Math.max(y, rightY + 35) + 20

      // ── Divider ──────────────────────────────────────────
      doc.strokeColor(borderGray)
         .lineWidth(0.5)
         .moveTo(40, y)
         .lineTo(555, y)
         .stroke()

      y += 20

      // ── Parties (From & To) ──────────────────────────────
      const partyY = y
      
      // Bill To (Left side)
      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('BILL TO', 40, partyY)
      
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text(invoice.client.name, 40, partyY + 12)
      
      doc.font('Helvetica')
         .fontSize(9)
         .fillColor(secondaryColor)
      
      let clientInfoY = partyY + 28
      if (invoice.client.businessName) {
        doc.text(invoice.client.businessName, 40, clientInfoY)
        clientInfoY += 12
      }
      doc.text(invoice.client.email, 40, clientInfoY)
      clientInfoY += 12
      if (invoice.client.phone) {
        doc.text(invoice.client.phone, 40, clientInfoY)
        clientInfoY += 12
      }
      if (invoice.client.address) {
        doc.text(invoice.client.address, 40, clientInfoY)
        clientInfoY += 12
      }

      // Invoice Dates Box (Right side)
      const boxWidth = 180
      const boxHeight = 55
      const boxX = 375
      
      doc.save()
         .roundedRect(boxX, partyY, boxWidth, boxHeight, 6)
         .fill(lightGray)
         .strokeColor(borderGray)
         .lineWidth(0.5)
         .stroke()
         .restore()

      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('ISSUE DATE', boxX + 15, partyY + 10)
         .text('DUE DATE', boxX + 100, partyY + 10)

      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text(formatDate(invoice.issueDate), boxX + 15, partyY + 22)
         .text(formatDate(invoice.dueDate), boxX + 100, partyY + 22)

      y = Math.max(clientInfoY, partyY + boxHeight) + 30

      // ── Line Items Table ─────────────────────────────────
      // Table Header Background
      doc.save()
         .rect(40, y, 515, 20)
         .fill(lightGray)
         .restore()

      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('DESCRIPTION', 50, y + 6)
         .text('QTY', 340, y + 6, { width: 40, align: 'center' })
         .text('RATE', 400, y + 6, { width: 60, align: 'right' })
         .text('AMOUNT', 480, y + 6, { width: 65, align: 'right' })

      y += 20

      // Table Rows
      invoice.lineItems.forEach((item: any) => {
        // Check if page needs break
        if (y > 700) {
          doc.addPage()
          y = 40
        }

        doc.fillColor(primaryColor)
           .font('Helvetica')
           .fontSize(9)
           .text(item.description, 50, y + 8, { width: 270 })

        const qtyStr = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
        doc.text(qtyStr, 340, y + 8, { width: 40, align: 'center' })
        doc.text(formatRupees(item.rate), 400, y + 8, { width: 60, align: 'right' })
        doc.font('Helvetica-Bold')
           .text(formatRupees(item.amount), 480, y + 8, { width: 65, align: 'right' })

        y += 28

        // Draw horizontal line
        doc.strokeColor(borderGray)
           .lineWidth(0.5)
           .moveTo(40, y)
           .lineTo(555, y)
           .stroke()
      })

      y += 10

      // ── Totals ───────────────────────────────────────────
      const totalsX = 350
      const totalsWidth = 195

      doc.fillColor(secondaryColor)
         .font('Helvetica')
         .fontSize(9)
         .text('Subtotal', totalsX, y, { width: 100, align: 'left' })
         .font('Helvetica-Bold')
         .text(formatRupees(invoice.subtotal), totalsX + 100, y, { width: 95, align: 'right' })

      y += 15

      if (invoice.gstPercentage > 0) {
        doc.fillColor(secondaryColor)
           .font('Helvetica')
           .fontSize(9)
           .text(`GST (${invoice.gstPercentage}%)`, totalsX, y, { width: 100, align: 'left' })
           .font('Helvetica-Bold')
           .text(formatRupees(invoice.gstAmount), totalsX + 100, y, { width: 95, align: 'right' })

        y += 15
      }

      // Draw final total line
      doc.strokeColor(primaryColor)
         .lineWidth(1)
         .moveTo(totalsX, y + 3)
         .lineTo(totalsX + 195, y + 3)
         .stroke()

      y += 8

      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('Total', totalsX, y, { width: 100, align: 'left' })
         .fontSize(12)
         .text(formatRupees(invoice.total), totalsX + 100, y - 1, { width: 95, align: 'right' })

      y += 25

      // ── Payment Details ──────────────────────────────────
      if (user.upiId || user.bankAccountNumber) {
        if (y > 680) {
          doc.addPage()
          y = 40
        }

        doc.fillColor(secondaryColor)
           .font('Helvetica-Bold')
           .fontSize(8)
           .text('PAYMENT DETAILS', 40, y)
        
        y += 12

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor(secondaryColor)

        if (user.upiId) {
          doc.text('UPI ID:', 40, y, { width: 80 })
             .font('Helvetica-Bold')
             .fillColor(primaryColor)
             .text(user.upiId, 120, y)
             .font('Helvetica')
             .fillColor(secondaryColor)
          y += 12
        }

        if (user.bankAccountNumber) {
          if (user.bankName) {
            doc.text('Bank:', 40, y, { width: 80 })
               .font('Helvetica-Bold')
               .fillColor(primaryColor)
               .text(user.bankName, 120, y)
               .font('Helvetica')
               .fillColor(secondaryColor)
            y += 12
          }
          doc.text('Account Name:', 40, y, { width: 80 })
             .font('Helvetica-Bold')
             .fillColor(primaryColor)
             .text(user.bankAccountName || user.name, 120, y)
             .font('Helvetica')
             .fillColor(secondaryColor)
          y += 12

          doc.text('Account No:', 40, y, { width: 80 })
             .font('Helvetica-Bold')
             .fillColor(primaryColor)
             .text(user.bankAccountNumber, 120, y)
             .font('Helvetica')
             .fillColor(secondaryColor)
          y += 12

          if (user.bankIfsc) {
            doc.text('IFSC:', 40, y, { width: 80 })
               .font('Helvetica-Bold')
               .fillColor(primaryColor)
               .text(user.bankIfsc, 120, y)
               .font('Helvetica')
               .fillColor(secondaryColor)
            y += 12
          }
        }

        y += 15
      }

      // ── Notes ────────────────────────────────────────────
      if (invoice.notes) {
        if (y > 700) {
          doc.addPage()
          y = 40
        }

        doc.fillColor(secondaryColor)
           .font('Helvetica-Bold')
           .fontSize(8)
           .text('NOTES', 40, y)
        
        y += 12

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor(secondaryColor)
           .text(invoice.notes, 40, y, { width: 515 })
      }

      // ── Footer ───────────────────────────────────────────
      // Always draw on current page at fixed bottom
      doc.strokeColor(borderGray)
         .lineWidth(0.5)
         .moveTo(40, 780)
         .lineTo(555, 780)
         .stroke()

      const footerText = invoice.payment 
        ? `Paid on ${formatDate(invoice.payment.date)}` 
        : `Please pay by ${formatDate(invoice.dueDate)}`

      // Thank You Signature stamp
      const fs = require('fs')
      const path = require('path')
      const sigPath = path.join(process.cwd(), 'uploads', 'thank_you_signature.png')
      if (fs.existsSync(sigPath)) {
        doc.image(sigPath, 475, 715, { width: 80 })
      }

      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text(footerText, 40, 788)

      doc.fillColor(mintColor)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('Generated by FreelanceFlow', 350, 788, { width: 205, align: 'right' })

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}
