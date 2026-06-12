import { createHmac } from "crypto";

/**
 * Generates a 16-character cryptographic signature for a hotel's table number
 * to prevent URL tampering.
 */
export function getTableSignature(hotelId: string, tableNumber: number): string {
  // Use a secret from env, fallback to hotelId (so it is unique per hotel even if env is empty)
  const secret = process.env.QR_SECRET || hotelId || "qrdine_secret_fallback_salt_2026";
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
  return signature === expected;
}
