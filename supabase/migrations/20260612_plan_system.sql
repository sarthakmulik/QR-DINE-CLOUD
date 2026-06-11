-- Migration: SaaS Subscription Plan, Staff, Coupons, Feedback and Call Waiter setup

-- ═══════════════════════════════════════════════════════════════
-- 1. Alter plan column constraints in hotels table
-- ═══════════════════════════════════════════════════════════════

-- Drop old check constraint if it exists
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_plan_check;

-- Normalize old plans to lowercase plan values
UPDATE hotels SET plan = 'basic' WHERE LOWER(plan) = 'basic';
UPDATE hotels SET plan = 'pro' WHERE LOWER(plan) = 'pro';
UPDATE hotels SET plan = 'elite' WHERE LOWER(plan) = 'enterprise' OR LOWER(plan) = 'elite' OR plan IS NULL;

-- Alter column default and add updated constraint
ALTER TABLE hotels ALTER COLUMN plan SET DEFAULT 'basic';
ALTER TABLE hotels ADD CONSTRAINT hotels_plan_check CHECK (plan IN ('basic', 'pro', 'elite'));


-- ═══════════════════════════════════════════════════════════════
-- 2. Create staff table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'kds', 'waiter')),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(hotel_id, email)
);


-- ═══════════════════════════════════════════════════════════════
-- 3. Create coupons table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  min_bill NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (hotel_id, code)
);


-- ═══════════════════════════════════════════════════════════════
-- 4. Create feedback table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  session_id UUID REFERENCES table_sessions(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ═══════════════════════════════════════════════════════════════
-- 5. Create waiter requests table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS waiter_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ═══════════════════════════════════════════════════════════════
-- 6. Add status column to session items
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE session_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'preparing'
  CHECK (status IN ('preparing', 'ready', 'served'));


-- ═══════════════════════════════════════════════════════════════
-- 7. Add performance indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_staff_hotel ON staff(hotel_id);
CREATE INDEX IF NOT EXISTS idx_coupons_hotel ON coupons(hotel_id);
CREATE INDEX IF NOT EXISTS idx_feedback_hotel ON feedback(hotel_id);
CREATE INDEX IF NOT EXISTS idx_waiter_requests_hotel ON waiter_requests(hotel_id);


-- ═══════════════════════════════════════════════════════════════
-- 8. Enable Row-Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Staff table policies
DROP POLICY IF EXISTS "Hotel owner CRUD staff" ON staff;
CREATE POLICY "Hotel owner CRUD staff" ON staff
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hotel_owner'
        AND profiles.hotel_id = staff.hotel_id
    )
  );

DROP POLICY IF EXISTS "Staff select staff" ON staff;
CREATE POLICY "Staff select staff" ON staff
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'staff'
        AND profiles.hotel_id = staff.hotel_id
    )
  );

-- Menu categories policies
DROP POLICY IF EXISTS "Public select menu_categories" ON menu_categories;
CREATE POLICY "Public select menu_categories" ON menu_categories
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Hotel owner CRUD menu_categories" ON menu_categories;
CREATE POLICY "Hotel owner CRUD menu_categories" ON menu_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hotel_owner'
        AND profiles.hotel_id = menu_categories.hotel_id
    )
  );

-- Menu items policies
DROP POLICY IF EXISTS "Public select menu_items" ON menu_items;
CREATE POLICY "Public select menu_items" ON menu_items
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Hotel owner CRUD menu_items" ON menu_items;
CREATE POLICY "Hotel owner CRUD menu_items" ON menu_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hotel_owner'
        AND profiles.hotel_id = menu_items.hotel_id
    )
  );

-- Coupons policies
DROP POLICY IF EXISTS "Public select coupons" ON coupons;
CREATE POLICY "Public select coupons" ON coupons
  FOR SELECT TO public USING (is_active = true);

DROP POLICY IF EXISTS "Hotel owner CRUD coupons" ON coupons;
CREATE POLICY "Hotel owner CRUD coupons" ON coupons
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hotel_owner'
        AND profiles.hotel_id = coupons.hotel_id
    )
  );

-- Feedback policies
DROP POLICY IF EXISTS "Public insert feedback" ON feedback;
CREATE POLICY "Public insert feedback" ON feedback
  FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Hotel owner select feedback" ON feedback;
CREATE POLICY "Hotel owner select feedback" ON feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hotel_owner'
        AND profiles.hotel_id = feedback.hotel_id
    )
  );

-- Waiter requests policies
DROP POLICY IF EXISTS "Public insert waiter_requests" ON waiter_requests;
CREATE POLICY "Public insert waiter_requests" ON waiter_requests
  FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Staff CRUD waiter_requests" ON waiter_requests;
CREATE POLICY "Staff CRUD waiter_requests" ON waiter_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'hotel_owner' OR profiles.role = 'staff')
        AND profiles.hotel_id = waiter_requests.hotel_id
    )
  );
