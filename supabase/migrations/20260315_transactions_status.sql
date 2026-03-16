-- Add status column to transactions so deals can be archived
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
