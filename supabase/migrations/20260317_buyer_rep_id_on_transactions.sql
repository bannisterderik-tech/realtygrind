ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_rep_id uuid REFERENCES listings(id) ON DELETE SET NULL;
