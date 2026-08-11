-- Add repeating customer discount toggle to hotels table (defaults to true for backward compatibility)
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS is_repeating_customer_discount_enabled BOOLEAN DEFAULT true;
