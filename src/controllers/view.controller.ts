import { Request, Response } from 'express'
import { prisma } from '../config/database'

// Format helpers for web page
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

export const viewInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        lineItems: true,
        payment: true,
        user: true,
      },
    })

    if (!invoice) {
      res.status(404).send('<h1>Invoice Not Found</h1>')
      return
    }

    // Increment viewCount and set viewedAt if null
    const updatedViewedAt = invoice.viewedAt || new Date()
    await prisma.invoice.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        viewedAt: updatedViewedAt,
        // Automatically mark as SENT if it was in DRAFT
        status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status
      },
    })

    // Setup line items HTML
    const lineItemsHtml = invoice.lineItems
      .map(
        (item: any) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50/50 transition">
          <td class="py-4 px-4 text-sm text-gray-700 font-medium">${item.description}</td>
          <td class="py-4 px-4 text-sm text-gray-500 text-center">${Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)}</td>
          <td class="py-4 px-4 text-sm text-gray-500 text-right">${formatRupees(item.rate)}</td>
          <td class="py-4 px-4 text-sm text-gray-900 text-right font-bold">${formatRupees(item.amount)}</td>
        </tr>
      `
      )
      .join('')

    const statusBadgeColor = {
      DRAFT: 'bg-gray-100 text-gray-600',
      SENT: 'bg-amber-50 text-amber-600 border border-amber-200/50',
      PAID: 'bg-emerald-50 text-emerald-600 border border-emerald-200/50',
      OVERDUE: 'bg-rose-50 text-rose-600 border border-rose-200/50',
    }[invoice.status as 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'] ?? 'bg-gray-100 text-gray-600'

    // Payment details HTML
    let paymentDetailsHtml = ''
    if (invoice.user.upiId || invoice.user.bankAccountNumber) {
      paymentDetailsHtml = `
        <div class="mt-8 p-6 bg-gray-50/60 rounded-xl border border-gray-100/50">
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Payment Details</h3>
          <div class="space-y-3">
            ${invoice.user.upiId ? `
              <div class="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-gray-100/50 gap-1">
                <span class="text-sm text-gray-500 font-medium">UPI ID</span>
                <div class="flex items-center gap-2">
                  <span id="upi-val" class="text-sm text-gray-800 font-bold select-all">${invoice.user.upiId}</span>
                  <button onclick="copyText('upi-val')" class="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition px-2.5 py-1 rounded-md">Copy</button>
                </div>
              </div>
            ` : ''}
            ${invoice.user.bankAccountNumber ? `
              <div class="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-gray-100/50 gap-1">
                <span class="text-sm text-gray-500 font-medium">Bank Name</span>
                <span class="text-sm text-gray-800 font-bold">${invoice.user.bankName ?? 'Not Specified'}</span>
              </div>
              <div class="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-gray-100/50 gap-1">
                <span class="text-sm text-gray-500 font-medium">Account Holder</span>
                <span class="text-sm text-gray-800 font-bold">${invoice.user.bankAccountName || invoice.user.name}</span>
              </div>
              <div class="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-gray-100/50 gap-1">
                <span class="text-sm text-gray-500 font-medium">Account Number</span>
                <div class="flex items-center gap-2">
                  <span id="ac-val" class="text-sm text-gray-800 font-bold select-all">${invoice.user.bankAccountNumber}</span>
                  <button onclick="copyText('ac-val')" class="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition px-2.5 py-1 rounded-md">Copy</button>
                </div>
              </div>
              <div class="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-gray-100/50 gap-1">
                <span class="text-sm text-gray-500 font-medium">IFSC Code</span>
                <div class="flex items-center gap-2">
                  <span id="ifsc-val" class="text-sm text-gray-800 font-bold select-all">${invoice.user.bankIfsc ?? ''}</span>
                  <button onclick="copyText('ifsc-val')" class="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition px-2.5 py-1 rounded-md">Copy</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `
    }

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${invoice.invoiceNumber}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Outfit', sans-serif;
          }
        </style>
      </head>
      <body class="bg-slate-50/50 min-h-screen py-6 sm:py-12 px-4 sm:px-6">
        <div class="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-slate-100/40 border border-slate-100/80 overflow-hidden">
          
          <!-- Banner Alert -->
          <div class="bg-emerald-600 text-white px-6 py-3 text-sm font-semibold flex justify-between items-center">
            <span>Online Invoice Portal</span>
            <span class="bg-white/20 text-xs px-2 py-0.5 rounded">Secure</span>
          </div>

          <div class="p-6 sm:p-10 space-y-8">
            <!-- Header Section -->
            <div class="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-100 pb-8">
              <div>
                <h1 class="text-2xl font-bold text-slate-900">${invoice.user.businessName || invoice.user.name}</h1>
                ${invoice.user.businessName ? `<p class="text-sm text-slate-500 font-medium mt-1">${invoice.user.name}</p>` : ''}
                <div class="text-xs text-slate-400 space-y-1 mt-3">
                  <p>${invoice.user.email}</p>
                  ${invoice.user.phone ? `<p>${invoice.user.phone}</p>` : ''}
                  ${invoice.user.address ? `<p>${invoice.user.address}</p>` : ''}
                  ${invoice.user.gstin ? `<p class="font-semibold text-slate-600">GSTIN: ${invoice.user.gstin}</p>` : ''}
                </div>
              </div>

              <div class="sm:text-right flex flex-col sm:items-end">
                <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Invoice</span>
                <span class="text-lg font-bold text-slate-800 mt-1">${invoice.invoiceNumber}</span>
                <span class="px-3 py-1 rounded-full text-xs font-bold mt-3 ${statusBadgeColor}">${invoice.status}</span>
              </div>
            </div>

            <!-- Party details (Bill to / Dates) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-100 pb-8">
              <div>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">Bill To</span>
                <h2 class="text-base font-bold text-slate-800">${invoice.client.name}</h2>
                <div class="text-xs text-slate-500 space-y-1 mt-2">
                  <p>${invoice.client.email ?? ''}</p>
                  ${invoice.client.phone ? `<p>${invoice.client.phone}</p>` : ''}
                  ${invoice.client.address ? `<p>${invoice.client.address}</p>` : ''}
                </div>
              </div>

              <div class="flex flex-col gap-4 sm:items-end">
                <div class="bg-slate-50/60 border border-slate-100 rounded-xl p-4 w-full max-w-[280px]">
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <span class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Issue Date</span>
                      <span class="text-xs font-semibold text-slate-700">${formatDate(invoice.issueDate)}</span>
                    </div>
                    <div>
                      <span class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Due Date</span>
                      <span class="text-xs font-bold text-rose-600">${formatDate(invoice.dueDate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Table of items -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th class="py-3 px-4 font-semibold">Description</th>
                    <th class="py-3 px-4 text-center font-semibold">Qty</th>
                    <th class="py-3 px-4 text-right font-semibold">Rate</th>
                    <th class="py-3 px-4 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml}
                </tbody>
              </table>
            </div>

            <!-- Totals section -->
            <div class="flex justify-end pt-4 border-t border-slate-100">
              <div class="w-full sm:w-80 space-y-3">
                <div class="flex justify-between text-sm py-1">
                  <span class="text-slate-500 font-medium">Subtotal</span>
                  <span class="text-slate-800 font-bold">${formatRupees(invoice.subtotal)}</span>
                </div>
                ${invoice.gstPercentage > 0 ? `
                  <div class="flex justify-between text-sm py-1">
                    <span class="text-slate-500 font-medium">GST (${invoice.gstPercentage}%)</span>
                    <span class="text-slate-800 font-bold">${formatRupees(invoice.gstAmount)}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between items-center border-t border-slate-200 pt-3">
                  <span class="text-base font-bold text-slate-800">Total Due</span>
                  <span class="text-xl font-extrabold text-emerald-600">${formatRupees(invoice.total)}</span>
                </div>
              </div>
            </div>

            <!-- Payment gateway information -->
            ${paymentDetailsHtml}

            <!-- Notes Section -->
            ${invoice.notes ? `
              <div class="p-6 bg-slate-50/40 rounded-xl border border-slate-100/50 mt-6">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</h4>
                <p class="text-xs text-slate-500 leading-relaxed">${invoice.notes}</p>
              </div>
            ` : ''}

          </div>

          <!-- Web Footer -->
          <div class="bg-slate-50 px-6 sm:px-10 py-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
            <span class="text-slate-400 font-medium">
              ${invoice.payment ? `✓ Paid on ${formatDate(invoice.payment.date)}` : `Please pay by ${formatDate(invoice.dueDate)}`}
            </span>
            <span class="text-slate-400 font-medium">
              Powered by <span class="text-emerald-600 font-bold">FreelanceFlow</span>
            </span>
          </div>

        </div>

        <script>
          function copyText(elementId) {
            const text = document.getElementById(elementId).innerText;
            navigator.clipboard.writeText(text).then(() => {
              const btn = event.target;
              const originalText = btn.innerText;
              btn.innerText = 'Copied!';
              btn.classList.remove('text-emerald-600', 'bg-emerald-50');
              btn.classList.add('text-white', 'bg-emerald-600');
              setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('text-white', 'bg-emerald-600');
                btn.classList.add('text-emerald-600', 'bg-emerald-50');
              }, 1500);
            });
          }
        </script>
      </body>
      </html>
    `

    res.send(html)
  } catch (error) {
    console.error('Error rendering web invoice:', error)
    res.status(500).send('<h1>Failed to load invoice</h1>')
  }
}
