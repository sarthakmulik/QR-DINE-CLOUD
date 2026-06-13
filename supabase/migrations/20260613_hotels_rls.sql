-- Migration: Enable RLS on hotels table and add select/update policy for owner/staff
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hotel select policy" ON hotels;
CREATE POLICY "Hotel select policy" ON hotels
  FOR SELECT TO authenticated
  USING (
    id = (
      SELECT hotel_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Hotel update policy" ON hotels;
CREATE POLICY "Hotel update policy" ON hotels
  FOR UPDATE TO authenticated
  USING (
    id = (
      SELECT hotel_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    id = (
      SELECT hotel_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );
