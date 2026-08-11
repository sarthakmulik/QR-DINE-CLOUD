-- Add parent_item_id for refill item dependencies
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_item_id);
