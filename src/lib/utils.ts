import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** For customer-facing menu prices: no decimals for whole numbers */
export function formatMenuPrice(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

export function generateLoginEmail(hotelName: string): string {
  const slug = hotelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "hotel"}${suffix}@qrdine.app`;
}

export function generatePassword(length = 12): string {
  const chars =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function getAppUrl(): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export function getDineUrl(hotelId: string, tableNumber: number): string {
  return `${getAppUrl()}/dine/${hotelId}/${tableNumber}`;
}
