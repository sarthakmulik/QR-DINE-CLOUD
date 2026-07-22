import bcrypt from "bcryptjs";
import crypto from "crypto";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getTokenSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for kitchen authentication");
  return secret;
}

function signatureFor(hotelId: string, pinHash: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", getTokenSecret())
    .update(`${hotelId}.${pinHash}.${expiresAt}`)
    .digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isKitchenPinHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

export async function verifyKitchenPin(pin: string, storedPin: string): Promise<boolean> {
  if (isKitchenPinHash(storedPin)) return bcrypt.compare(pin, storedPin);
  return safeEqual(pin, storedPin);
}

export async function hashKitchenPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

export function createKitchenToken(hotelId: string, pinHash: string): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const signature = signatureFor(hotelId, pinHash, expiresAt);
  return { token: `${expiresAt}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyKitchenToken(token: string, hotelId: string, pinHash: string): boolean {
  const [expiresAtRaw, signature, ...extra] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (extra.length > 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !signature) return false;
  return safeEqual(signature, signatureFor(hotelId, pinHash, expiresAt));
}
