-- Add status column to presentations for async background generation
-- Values: 'generating' (in progress), 'ready' (complete), 'failed' (error)
ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';

-- Index for polling queries (frontend polls by id + status)
CREATE INDEX IF NOT EXISTS presentations_status_idx ON presentations(id, status);
