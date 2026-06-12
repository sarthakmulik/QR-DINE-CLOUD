-- Migration: Add secure_qr column to hotels table for Strict QR Table Verification
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS secure_qr BOOLEAN DEFAULT false;
