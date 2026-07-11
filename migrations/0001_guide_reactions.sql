CREATE TABLE IF NOT EXISTS guide_reactions (
  page TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('happy', 'surprised', 'sad', 'angry')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (page, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_reactions_page ON guide_reactions (page);

CREATE TABLE IF NOT EXISTS guide_reaction_rate_limits (
  visitor_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL
);
