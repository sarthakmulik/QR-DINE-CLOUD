-- Tier 1 Operational Upgrades
-- Run this in your Supabase SQL Editor

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS kitchen_pin TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT NULL;
