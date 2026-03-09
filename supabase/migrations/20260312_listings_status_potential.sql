-- Allow 'potential' as a valid status for the listings table.
-- The existing listings_status_check constraint only permits (active, pending, closed).
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'pending', 'closed', 'potential'));
