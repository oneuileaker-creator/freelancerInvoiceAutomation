import puppeteer from 'puppeteer'

// ── Format helpers ─────────────────────────────────────────
const formatRupees = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', {
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

// ── Build invoice HTML ─────────────────────────────────────
const buildInvoiceHtml = (invoice: any, user: any): string => {
  const lineItemsHtml = invoice.lineItems
    .map(
      (item: any) => `
      <tr>
        <td class="td-desc">${item.description}</td>
        <td class="td-center">${Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)}</td>
        <td class="td-right">${formatRupees(item.rate)}</td>
        <td class="td-right td-bold">${formatRupees(item.amount)}</td>
      </tr>
    `
    )
    .join('')

  const paymentDetailsHtml = `
    ${user.upiId ? `<div class="payment-row"><span class="pay-label">UPI</span><span class="pay-value">${user.upiId}</span></div>` : ''}
    ${user.bankAccountNumber ? `
      <div class="payment-row"><span class="pay-label">Bank</span><span class="pay-value">${user.bankName ?? ''}</span></div>
      <div class="payment-row"><span class="pay-label">A/C No</span><span class="pay-value">${user.bankAccountNumber}</span></div>
      <div class="payment-row"><span class="pay-label">IFSC</span><span class="pay-value">${user.bankIfsc ?? ''}</span></div>
    ` : ''}
  `

  const statusBadgeColor = {
    DRAFT: '#6B6B6B',
    SENT: '#F5A623',
    PAID: '#00E5A0',
    OVERDUE: '#FF4444',
  }[invoice.status as 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'] ?? '#6B6B6B'

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        color: #0A0A0A;
        background: #FFFFFF;
        padding: 48px;
        line-height: 1.5;
      }

      /* ── Header ── */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 40px;
        padding-bottom: 24px;
        border-bottom: 1px solid #E4E4E4;
      }

      .business-name {
        font-size: 20px;
        font-weight: 700;
        color: #0A0A0A;
        margin-bottom: 4px;
      }

      .business-detail {
        font-size: 12px;
        color: #6B6B6B;
        margin-bottom: 2px;
      }

      .invoice-label {
        font-size: 28px;
        font-weight: 700;
        color: #0A0A0A;
        text-align: right;
        letter-spacing: -0.5px;
      }

      .invoice-number {
        font-size: 13px;
        color: #6B6B6B;
        text-align: right;
        margin-top: 4px;
      }

      .status-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.3px;
        color: ${statusBadgeColor};
        background: ${statusBadgeColor}18;
        margin-top: 6px;
      }

      /* ── From / To ── */
      .parties {
        display: flex;
        justify-content: space-between;
        margin-bottom: 36px;
      }

      .party-block { width: 45%; }

      .party-label {
        font-size: 10px;
        font-weight: 600;
        color: #6B6B6B;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .party-name {
        font-size: 15px;
        font-weight: 600;
        color: #0A0A0A;
        margin-bottom: 4px;
      }

      .party-detail {
        font-size: 12px;
        color: #6B6B6B;
        margin-bottom: 2px;
      }

      /* ── Dates ── */
      .dates {
        display: flex;
        gap: 32px;
        margin-bottom: 36px;
        padding: 16px;
        background: #F9F9F9;
        border-radius: 6px;
        border: 1px solid #E4E4E4;
      }

      .date-item { }

      .date-label {
        font-size: 10px;
        color: #6B6B6B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
        font-weight: 600;
      }

      .date-value {
        font-size: 13px;
        font-weight: 600;
        color: #0A0A0A;
      }

      /* ── Line items table ── */
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0;
      }

      .table-header th {
        padding: 10px 12px;
        text-align: left;
        font-size: 10px;
        font-weight: 600;
        color: #6B6B6B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #E4E4E4;
        background: #F9F9F9;
      }

      td {
        padding: 12px;
        border-bottom: 1px solid #E4E4E4;
        vertical-align: top;
      }

      .td-center { text-align: center; }
      .td-right { text-align: right; }
      .td-bold { font-weight: 600; }
      .td-desc { color: #0A0A0A; font-weight: 500; }

      /* ── Totals ── */
      .totals-section {
        margin-top: 0;
        border: 1px solid #E4E4E4;
        border-top: none;
        border-radius: 0 0 6px 6px;
        overflow: hidden;
      }

      .table-wrapper {
        border: 1px solid #E4E4E4;
        border-radius: 6px 6px 0 0;
        overflow: hidden;
      }

      .total-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 16px;
        border-bottom: 1px solid #E4E4E4;
      }

      .total-row:last-child { border-bottom: none; }

      .total-label { color: #6B6B6B; font-size: 13px; }
      .total-value { color: #6B6B6B; font-size: 13px; }

      .total-final {
        background: #F9F9F9;
        border-top: 2px solid #0A0A0A !important;
      }

      .total-final .total-label {
        font-weight: 700;
        font-size: 15px;
        color: #0A0A0A;
      }

      .total-final .total-value {
        font-weight: 700;
        font-size: 15px;
        color: #0A0A0A;
      }

      /* ── Payment details ── */
      .payment-section {
        margin-top: 32px;
        padding: 16px;
        border: 1px solid #E4E4E4;
        border-radius: 6px;
        background: #F9F9F9;
      }

      .section-title {
        font-size: 10px;
        font-weight: 600;
        color: #6B6B6B;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 12px;
      }

      .payment-row {
        display: flex;
        gap: 16px;
        margin-bottom: 6px;
      }

      .pay-label {
        font-size: 11px;
        color: #6B6B6B;
        width: 64px;
        flex-shrink: 0;
      }

      .pay-value {
        font-size: 12px;
        font-weight: 600;
        color: #0A0A0A;
      }

      /* ── Notes + Footer ── */
      .notes-section {
        margin-top: 24px;
        padding: 14px;
        border: 1px solid #E4E4E4;
        border-radius: 6px;
      }

      .notes-text {
        font-size: 12px;
        color: #6B6B6B;
        line-height: 1.6;
      }

      .footer {
        margin-top: 40px;
        padding-top: 16px;
        border-top: 1px solid #E4E4E4;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .footer-text {
        font-size: 11px;
        color: #B0B0B0;
      }

      .footer-brand {
        font-size: 11px;
        color: #B0B0B0;
      }

      .mint { color: #00E5A0; }
    </style>
  </head>
  <body>

    <!-- Header -->
    <div class="header">
      <div>
        <div class="business-name">${user.businessName ?? user.name}</div>
        ${user.address ? `<div class="business-detail">${user.address}</div>` : ''}
        ${user.phone ? `<div class="business-detail">${user.phone}</div>` : ''}
        ${user.email ? `<div class="business-detail">${user.email}</div>` : ''}
        ${user.gstin ? `<div class="business-detail">GSTIN: ${user.gstin}</div>` : ''}
      </div>
      <div>
        <div class="invoice-label">INVOICE</div>
        <div class="invoice-number">${invoice.invoiceNumber}</div>
        <div style="text-align:right">
          <span class="status-badge">${invoice.status}</span>
        </div>
      </div>
    </div>

    <!-- From / To -->
    <div class="parties">
      <div class="party-block">
        <div class="party-label">From</div>
        <div class="party-name">${user.businessName ?? user.name}</div>
        ${user.address ? `<div class="party-detail">${user.address}</div>` : ''}
      </div>
      <div class="party-block">
        <div class="party-label">Bill To</div>
        <div class="party-name">${invoice.client.name}</div>
        ${invoice.client.address ? `<div class="party-detail">${invoice.client.address}</div>` : ''}
        ${invoice.client.email ? `<div class="party-detail">${invoice.client.email}</div>` : ''}
        ${invoice.client.gstin ? `<div class="party-detail">GSTIN: ${invoice.client.gstin}</div>` : ''}
      </div>
    </div>

    <!-- Dates -->
    <div class="dates">
      <div class="date-item">
        <div class="date-label">Issue Date</div>
        <div class="date-value">${formatDate(invoice.issueDate)}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Due Date</div>
        <div class="date-value">${formatDate(invoice.dueDate)}</div>
      </div>
      ${invoice.paymentTerms ? `
      <div class="date-item">
        <div class="date-label">Payment Terms</div>
        <div class="date-value">${invoice.paymentTerms}</div>
      </div>
      ` : ''}
    </div>

    <!-- Line Items -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr class="table-header">
            <th style="width:50%">Description</th>
            <th style="width:10%;text-align:center">Qty</th>
            <th style="width:20%;text-align:right">Rate</th>
            <th style="width:20%;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="total-row">
        <span class="total-label">Subtotal</span>
        <span class="total-value">${formatRupees(invoice.subtotal)}</span>
      </div>
      ${invoice.gstPercentage > 0 ? `
      <div class="total-row">
        <span class="total-label">GST (${invoice.gstPercentage}%)</span>
        <span class="total-value">${formatRupees(invoice.gstAmount)}</span>
      </div>
      ` : ''}
      <div class="total-row total-final">
        <span class="total-label">Total</span>
        <span class="total-value">${formatRupees(invoice.total)}</span>
      </div>
    </div>

    <!-- Payment Details -->
    ${(user.upiId || user.bankAccountNumber) ? `
    <div class="payment-section">
      <div class="section-title">Payment Details</div>
      ${paymentDetailsHtml}
    </div>
    ` : ''}

    <!-- Notes -->
    ${invoice.notes ? `
    <div class="notes-section">
      <div class="section-title">Notes</div>
      <div class="notes-text">${invoice.notes}</div>
    </div>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
      <span class="footer-text">
        ${invoice.payment ? `✓ Paid on ${formatDate(invoice.payment.date)}` : `Please pay by ${formatDate(invoice.dueDate)}`}
      </span>
      <span class="footer-brand">
        Generated by <span class="mint">FreelanceFlow</span>
      </span>
    </div>

  </body>
  </html>
  `
}

// ── Generate PDF buffer ────────────────────────────────────
export const generateInvoicePdf = async (
  invoice: any,
  user: any
): Promise<Buffer> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  })

  try {
    const page = await browser.newPage()
    const html = buildInvoiceHtml(invoice, user)

    await page.setContent(html, { waitUntil: 'networkidle0' as any })

    const pdf = await page.pdf({
      format: 'A4',
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px',
      },
      printBackground: true,
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
