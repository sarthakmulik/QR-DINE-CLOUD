ALTER TABLE hotels
ADD COLUMN IF NOT EXISTS whatsapp_bill_enabled BOOLEAN DEFAULT false;