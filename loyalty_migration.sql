-- Create the customers table for Loyalty Engine
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    cycle_visits INT DEFAULT 0,
    monthly_visits INT DEFAULT 0,
    current_month VARCHAR(7), -- Format: 'YYYY-MM'
    total_visits INT DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0.00,
    last_visit_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(hotel_id, phone)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Optional: Create basic RLS policies if you need frontend querying.
-- Since most CRM logic happens server-side via Admin Client, we might not need public RLS, 
-- but allowing authenticated read is safe.
CREATE POLICY "Allow authenticated read for customers"
    ON public.customers
    FOR SELECT
    USING (auth.role() = 'authenticated');
