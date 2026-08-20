CREATE TABLE guide_reactions_with_place_love (
  page TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('happy', 'surprised', 'sad', 'angry', 'love')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (page, visitor_id)
);

INSERT INTO guide_reactions_with_place_love (page, visitor_id, reaction, created_at, updated_at)
SELECT page, visitor_id, reaction, created_at, updated_at
FROM guide_reactions;

DROP TABLE guide_reactions;

ALTER TABLE guide_reactions_with_place_love RENAME TO guide_reactions;

CREATE INDEX idx_guide_reactions_page ON guide_reactions (page);
