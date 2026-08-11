import type { BillData, PrinterSize } from "./bill-generator";

// ESC/POS Commands
const ESC = 0x1b;
const GS = 0x1d;

export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  // Initialize printer
  init() {
    this.buffer.push(ESC, 0x40);
  }

  // Text alignment: 0=Left, 1=Center, 2=Right
  setAlign(align: 0 | 1 | 2) {
    this.buffer.push(ESC, 0x61, align);
  }

  // Bold on/off
  setBold(bold: boolean) {
    this.buffer.push(ESC, 0x45, bold ? 1 : 0);
  }

  // Write text
  text(str: string) {
    for (let i = 0; i < str.length; i++) {
      // Basic ASCII conversion. Replace non-ascii with '?'
      let code = str.charCodeAt(i);
      if (code > 255) {
        if (str[i] === '₹') code = 0x52; // Rs or R (fallback since true rupee symbol requires codepage tweaks)
        else code = 63; // '?'
      }
      this.buffer.push(code);
    }
  }

  // Newline
  newline(count = 1) {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a);
    }
  }

  // Text with newline
  line(str: string) {
    this.text(str);
    this.newline();
  }

  // Full cut and feed
  cut() {
    this.buffer.push(GS, 0x56, 0x41, 0x03);
  }

  // Return the raw Uint8Array
  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// Helpers for string padding
function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return " ".repeat(len - str.length) + str;
}

export function generateRawEscPos(
  data: BillData,
  printerSize: PrinterSize,
  paymentMethod?: string
): Uint8Array {
  const { session, items, hotel, table } = data;
  const encoder = new EscPosEncoder();

  // 58mm usually has 32 chars per line. 80mm has 48.
  const LINE_WIDTH = printerSize === "58mm" ? 32 : 48;
  const QTY_WIDTH = 4;
  const RATE_WIDTH = printerSize === "58mm" ? 6 : 8;
  const AMT_WIDTH = printerSize === "58mm" ? 7 : 9;
  const NAME_WIDTH = LINE_WIDTH - QTY_WIDTH - RATE_WIDTH - AMT_WIDTH - 3; // 3 spaces

  const tableLabel = table?.label || `Table ${session.tableNumber}`;
  const resolvedPayment = paymentMethod || session.paymentMethod || "";
  const cgst = hotel?.cgst ?? (hotel?.taxRate ?? 5) / 2;
  const sgst = hotel?.sgst ?? (hotel?.taxRate ?? 5) / 2;

  // Header
  encoder.setAlign(1); // Center
  encoder.setBold(true);
  encoder.line(hotel?.name || "Restaurant");
  encoder.setBold(false);
  
  if (hotel?.address) encoder.line(hotel.address);
  if (hotel?.gstNumber) encoder.line(`GSTIN: ${hotel.gstNumber}`);
  
  encoder.newline();
  encoder.line("-".repeat(LINE_WIDTH));
  
  encoder.setAlign(0); // Left
  encoder.setBold(true);
  encoder.line("TAX INVOICE");
  encoder.setBold(false);
  encoder.line(`Table: ${tableLabel}`);
  
  let dateStr = session.startTime;
  try {
    const d = new Date(session.startTime);
    dateStr = d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch {}
  
  encoder.line(`Date: ${dateStr}`);
  encoder.line(`Bill #: ${session.id.slice(-8).toUpperCase()}`);
  
  encoder.line("-".repeat(LINE_WIDTH));
  
  // Table Header
  encoder.setBold(true);
  const hName = padRight("Item", NAME_WIDTH);
  const hQty = padLeft("Qty", QTY_WIDTH);
  const hRate = padLeft("Rate", RATE_WIDTH);
  const hAmt = padLeft("Amt", AMT_WIDTH);
  encoder.line(`${hName} ${hQty} ${hRate} ${hAmt}`);
  encoder.setBold(false);
  
  // Items
  for (const item of items) {
    const nameStr = padRight(item.name.substring(0, NAME_WIDTH), NAME_WIDTH);
    const qtyStr = padLeft(item.quantity.toString(), QTY_WIDTH);
    const rateStr = padLeft(item.price.toFixed(2), RATE_WIDTH);
    const amtStr = padLeft((item.price * item.quantity).toFixed(2), AMT_WIDTH);
    encoder.line(`${nameStr} ${qtyStr} ${rateStr} ${amtStr}`);
  }
  
  encoder.line("-".repeat(LINE_WIDTH));
  
  // Totals
  const subtotalStr = padLeft(session.subtotal.toFixed(2), AMT_WIDTH);
  encoder.line(padLeft(`Subtotal: ${subtotalStr}`, LINE_WIDTH));
  
  if (session.discountAmount > 0) {
    const dStr = padLeft("-" + session.discountAmount.toFixed(2), AMT_WIDTH);
    const label = `Discount${session.couponCode ? ` (${session.couponCode})` : ""}`;
    encoder.line(padLeft(`${label}: ${dStr}`, LINE_WIDTH));
  }
  
  const cgstStr = padLeft((session.taxAmount / 2).toFixed(2), AMT_WIDTH);
  encoder.line(padLeft(`CGST @ ${cgst}%: ${cgstStr}`, LINE_WIDTH));
  
  const sgstStr = padLeft((session.taxAmount / 2).toFixed(2), AMT_WIDTH);
  encoder.line(padLeft(`SGST @ ${sgst}%: ${sgstStr}`, LINE_WIDTH));
  
  encoder.setBold(true);
  const totStr = padLeft(session.total.toFixed(2), AMT_WIDTH);
  encoder.line(padLeft(`GRAND TOTAL: ${totStr}`, LINE_WIDTH));
  encoder.setBold(false);
  
  if (resolvedPayment) {
    encoder.newline();
    encoder.setAlign(1);
    encoder.line(`PAID - ${resolvedPayment.toUpperCase()}`);
  }
  
  encoder.newline();
  encoder.line("-".repeat(LINE_WIDTH));
  encoder.setAlign(1);
  encoder.line("Thank you for dining with us!");
  encoder.line("Please visit again!");
  encoder.newline(3); // Feed paper
  encoder.cut();
  
  return encoder.encode();
}
