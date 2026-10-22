-- Cloudflare D1 Database Schema for Web Vocab System

CREATE TABLE IF NOT EXISTS textbook_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book TEXT NOT NULL,
  unit TEXT NOT NULL,
  word TEXT NOT NULL,
  pos TEXT DEFAULT '',
  meaning TEXT DEFAULT '',
  font TEXT DEFAULT '白体',
  note TEXT DEFAULT '',
  head_lower TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tb_head ON textbook_words(head_lower);
CREATE INDEX IF NOT EXISTS idx_tb_book ON textbook_words(book);
CREATE INDEX IF NOT EXISTS idx_tb_word ON textbook_words(word);

CREATE TABLE IF NOT EXISTS word_derivatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_group TEXT DEFAULT '',
  trigger_word TEXT NOT NULL,
  word TEXT NOT NULL,
  pos TEXT DEFAULT '',
  meaning TEXT DEFAULT '',
  level TEXT DEFAULT '高考拓展'
);

CREATE INDEX IF NOT EXISTS idx_deriv_trigger ON word_derivatives(trigger_word);
CREATE INDEX IF NOT EXISTS idx_deriv_word ON word_derivatives(word);
CREATE INDEX IF NOT EXISTS idx_deriv_root ON word_derivatives(root_group);
