-- ==========================================
-- PHASE 1 & 2: ENTERPRISE UPGRADE SCHEMA
-- (Inventory, Recipes, Cash Registers)
-- ==========================================

-- 1. Raw Materials Table
CREATE TABLE IF NOT EXISTS public.raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL, -- e.g., kg, L, pc, g, ml
    current_stock NUMERIC NOT NULL DEFAULT 0,
    min_stock_alert NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Recipes Table (Bill of Materials)
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
    quantity_used NUMERIC NOT NULL, -- Amount of unit deducted per order
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(menu_item_id, raw_material_id)
);

-- 3. Inventory Logs Table (Audit Trail)
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('restock', 'deduction', 'adjustment', 'waste')),
    amount NUMERIC NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Cash Registers (Shift Management)
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES auth.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    opening_balance NUMERIC NOT NULL DEFAULT 0,
    closing_balance NUMERIC,
    expected_closing_balance NUMERIC,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- 5. Cash Register Logs (Petty Cash & Payouts)
CREATE TABLE IF NOT EXISTS public.cash_register_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out', 'sale', 'refund')),
    amount NUMERIC NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLICIES
-- ==========================================

-- RAW MATERIALS
CREATE POLICY "Hotel staff can read raw_materials" ON public.raw_materials
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = raw_materials.hotel_id));
CREATE POLICY "Hotel admins can modify raw_materials" ON public.raw_materials
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = raw_materials.hotel_id AND profiles.role IN ('hotel_owner', 'manager', 'cashier')));

-- RECIPES
CREATE POLICY "Hotel staff can read recipes" ON public.recipes
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.menu_items 
        JOIN public.profiles ON profiles.hotel_id = menu_items.hotel_id 
        WHERE menu_items.id = recipes.menu_item_id AND profiles.id = auth.uid()
    ));
CREATE POLICY "Hotel admins can modify recipes" ON public.recipes
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.menu_items 
        JOIN public.profiles ON profiles.hotel_id = menu_items.hotel_id 
        WHERE menu_items.id = recipes.menu_item_id AND profiles.id = auth.uid() AND profiles.role IN ('hotel_owner', 'manager')
    ));

-- INVENTORY LOGS
CREATE POLICY "Hotel staff can read inventory logs" ON public.inventory_logs
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = inventory_logs.hotel_id));
CREATE POLICY "Hotel admins can modify inventory logs" ON public.inventory_logs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = inventory_logs.hotel_id AND profiles.role IN ('hotel_owner', 'manager', 'cashier')));

-- CASH REGISTERS
CREATE POLICY "Hotel staff can read registers" ON public.cash_registers
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = cash_registers.hotel_id));
CREATE POLICY "Hotel admins can modify registers" ON public.cash_registers
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.hotel_id = cash_registers.hotel_id AND profiles.role IN ('hotel_owner', 'manager', 'cashier')));

-- CASH REGISTER LOGS
CREATE POLICY "Hotel staff can read register logs" ON public.cash_register_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cash_registers 
        JOIN public.profiles ON profiles.hotel_id = cash_registers.hotel_id 
        WHERE cash_registers.id = cash_register_logs.register_id AND profiles.id = auth.uid()
    ));
CREATE POLICY "Hotel admins can modify register logs" ON public.cash_register_logs
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cash_registers 
        JOIN public.profiles ON profiles.hotel_id = cash_registers.hotel_id 
        WHERE cash_registers.id = cash_register_logs.register_id AND profiles.id = auth.uid() AND profiles.role IN ('hotel_owner', 'manager', 'cashier')
    ));
