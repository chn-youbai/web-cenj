-- Cloudflare D1 Database Schema for Web-Cenj Full Stack

-- 1. 教材词汇主表 (/api/vocab)
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

-- 2. 同根派生词库表 (/api/derivatives)
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

-- 3. 站点计数统计表 (/api/click)
CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- 4. 图库与视频元信息表 (/api/videos, /api/video, /api/upload-asset)
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  file_size INTEGER DEFAULT 0,
  poster_url TEXT DEFAULT '',
  asset_url TEXT NOT NULL,
  download_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

-- 5. Clash 云控状态及订阅配置表 (/api/clash, /api/subscription, /api/sub)
CREATE TABLE IF NOT EXISTS clash_control (
  id TEXT PRIMARY KEY,
  command TEXT DEFAULT '',
  payload TEXT DEFAULT '',
  status TEXT DEFAULT '',
  result TEXT DEFAULT '',
  dispatched_at TEXT,
  responded_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. 2050 词库跨端云同步表 (/api/recite-sync)
CREATE TABLE IF NOT EXISTS recite_sync (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 7. 秘密留言板表 (/api/board)
CREATE TABLE IF NOT EXISTS guestbook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER DEFAULT NULL,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  likes INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  ip TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_guestbook_parent ON guestbook_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook_messages(created_at DESC);
