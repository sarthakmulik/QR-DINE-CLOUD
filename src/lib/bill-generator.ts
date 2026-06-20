/**
 * Client-side thermal receipt bill generator.
 * Produces a fully self-contained HTML string with 100% inline styles —
 * no external CSS, no fonts to load, safe to inject via iframe srcdoc.
 */

export type PrinterSize = "58mm" | "80mm";

export interface BillData {
  session: {
    id: string;
    tableNumber: number;
    startTime: string;
    subtotal: number;
    discountAmount: number;
    discountPercent: number;
    taxAmount: number;
    total: number;
    couponCode?: string | null;
    paymentMethod?: string | null;
  };
  items: { id: string; name: string; price: number; quantity: number }[];
  hotel: {
    name: string;
    address?: string | null;
    gstNumber?: string | null;
    logo?: string | null;
    upiId?: string | null;
    taxRate: number;
    cgst: number;
    sgst: number;
    printerSize?: PrinterSize;
  } | null;
  table: { label?: string | null } | null;
}

function formatINR(amount: number): string {
  return `\u20B9${Number(amount).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function generateBillHTML(
  data: BillData,
  printerSize: PrinterSize,
  paymentMethod?: string
): string {
  const { session, items, hotel, table } = data;

  const width = printerSize === "58mm" ? "54mm" : "76mm";
  const fontSize = printerSize === "58mm" ? "10px" : "12px";
  const headerSize = printerSize === "58mm" ? "13px" : "16px";
  const padding = printerSize === "58mm" ? "2mm" : "3mm";

  const tableLabel = table?.label || `Table ${session.tableNumber}`;
  const cgst = hotel?.cgst ?? (hotel?.taxRate ?? 5) / 2;
  const sgst = hotel?.sgst ?? (hotel?.taxRate ?? 5) / 2;
  const resolvedPayment = paymentMethod || session.paymentMethod || "";

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:2px 0;word-break:break-word;max-width:${printerSize === "58mm" ? "95px" : "130px"}">${item.name}</td>
      <td style="padding:2px 4px;text-align:center;white-space:nowrap">${item.quantity}</td>
      <td style="padding:2px 0;text-align:right;white-space:nowrap">${formatINR(item.price)}</td>
      <td style="padding:2px 0 2px 4px;text-align:right;white-space:nowrap">${formatINR(item.price * item.quantity)}</td>
    </tr>
  `).join("");

  const discountRow = session.discountAmount > 0 ? `
    <tr style="color:#555">
      <td colspan="3" style="padding:2px 0">Discount${session.couponCode ? ` (${session.couponCode})` : ""}</td>
      <td style="padding:2px 0;text-align:right">-${formatINR(session.discountAmount)}</td>
    </tr>
  ` : "";

  const paymentBadge = resolvedPayment ? `
    <div style="margin:6px 0 2px;padding:4px 8px;border:1px solid #333;border-radius:4px;text-align:center;font-size:${fontSize};font-weight:bold;letter-spacing:0.5px">
      PAID \u2014 ${resolvedPayment.toUpperCase()}
    </div>
  ` : "";

  const logoHTML = hotel?.logo ? `
    <img src="${hotel.logo}" alt="logo" style="width:40px;height:40px;object-fit:contain;margin:0 auto 4px;display:block;border-radius:50%" />
  ` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${width};
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    color: #000;
    background: #fff;
    padding: ${padding};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    size: ${printerSize} auto;
    margin: 0;
  }
  @media print {
    html, body { width: ${width}; }
    .no-print { display: none !important; }
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { font-weight: bold; padding: 2px 0; border-bottom: 1px dashed #000; }
  .total-row td { font-weight: bold; font-size: ${printerSize === "58mm" ? "12px" : "14px"}; border-top: 1px dashed #000; padding-top: 4px; }
</style>
</head>
<body>
  ${logoHTML}
  <div class="center bold" style="font-size:${headerSize};margin-bottom:2px">${hotel?.name || "Restaurant"}</div>
  ${hotel?.address ? `<div class="center" style="font-size:9px;margin-bottom:1px">${hotel.address}</div>` : ""}
  ${hotel?.gstNumber ? `<div class="center" style="font-size:9px">GSTIN: ${hotel.gstNumber}</div>` : ""}

  <div class="divider"></div>

  <div style="font-size:9px">
    <div><b>TAX INVOICE</b></div>
    <div>Table: <b>${tableLabel}</b></div>
    <div>Date: ${formatDate(session.startTime)}</div>
    <div>Bill #: ${session.id.slice(-8).toUpperCase()}</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Item</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="padding:4px 0 2px;border-top:1px dashed #000">Subtotal</td>
        <td style="text-align:right;padding:4px 0 2px;border-top:1px dashed #000">${formatINR(session.subtotal)}</td>
      </tr>
      ${discountRow}
      <tr style="color:#555">
        <td colspan="3" style="padding:2px 0">CGST @ ${cgst}%</td>
        <td style="text-align:right">${formatINR(session.taxAmount / 2)}</td>
      </tr>
      <tr style="color:#555">
        <td colspan="3" style="padding:2px 0">SGST @ ${sgst}%</td>
        <td style="text-align:right">${formatINR(session.taxAmount / 2)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" style="padding:4px 0">GRAND TOTAL</td>
        <td style="text-align:right">${formatINR(session.total)}</td>
      </tr>
    </tfoot>
  </table>

  ${paymentBadge}

  <div class="divider"></div>
  <div class="center" style="font-size:9px;margin-top:4px">Thank you for dining with us!</div>
  <div class="center" style="font-size:9px">Please visit again \uD83D\uDE4F</div>
  <div style="margin-top:8px"></div>
</body>
</html>`;
}

/**
 * Silently prints an HTML string using a hidden iframe with srcdoc.
 * Does NOT open a new tab. Auto-removes the iframe after printing.
 */
export function silentPrint(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;border:none;opacity:0;pointer-events:none;";
  iframe.setAttribute("srcdoc", html);
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Silent print failed:", e);
    }
    // Remove iframe after print dialog closes (afterprint) or after timeout
    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch {}
    };
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 30000); // fallback cleanup after 30s
  };
}
