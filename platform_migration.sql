-- Create platform_settings table
CREATE TABLE platform_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_api_key text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Initialize a single row for settings (singleton)
INSERT INTO platform_settings (id) VALUES ('00000000-0000-0000-0000-000000000001');

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only superadmin can access platform_settings
CREATE POLICY "Superadmins can manage platform settings" ON platform_settings
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'superadmin'
    )
  );
