import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generates a 16-character cryptographic signature for a hotel's table number
 * to prevent URL tampering.
 */
export function getTableSignature(hotelId: string, tableNumber: number): string {
  const secret = process.env.QR_SECRET;
  if (!secret) throw new Error("QR_SECRET is required for secure QR signing");
  return createHmac("sha256", secret)
    .update(`${hotelId}:${tableNumber}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Verifies if the provided signature matches the expected signature for a given hotel and table.
 */
export function verifyTableSignature(hotelId: string, tableNumber: number, signature: string | null): boolean {
  if (!signature) return false;
  const expected = getTableSignature(hotelId, tableNumber);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
}
