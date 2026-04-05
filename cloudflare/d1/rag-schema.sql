CREATE TABLE IF NOT EXISTS rag_documents (
  document_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  category TEXT,
  city TEXT,
  tags_json TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  chunk_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES rag_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_category_city
  ON rag_documents(category, city);

CREATE INDEX IF NOT EXISTS idx_rag_documents_updated
  ON rag_documents(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
  ON rag_chunks(document_id, chunk_index);
