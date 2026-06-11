-- Run in Supabase SQL Editor after schema.sql
-- Allows logged-in users to read their own profile (required for auth redirect)

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
