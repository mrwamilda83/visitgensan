CREATE TABLE IF NOT EXISTS contact_abuse_records (
  record_type TEXT NOT NULL CHECK (record_type IN ('attempt_15m', 'attempt_24h', 'duplicate')),
  record_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (record_type, record_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_contact_abuse_expires_at
  ON contact_abuse_records (expires_at);
