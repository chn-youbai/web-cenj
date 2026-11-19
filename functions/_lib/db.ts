/**
 * Cloudflare D1 辅助工具：按需幂等建表与 clash_control JSON 配置读写
 */

export async function ensureGuestbookTable(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS guestbook_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER DEFAULT NULL,
        nickname TEXT NOT NULL,
        content TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        likes INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        ip TEXT DEFAULT ''
      )
    `)
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_guestbook_parent ON guestbook_messages(parent_id)")
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook_messages(created_at DESC)",
      )
      .run();
  } catch {
    // ignore if table/index already exists
  }
}

export async function ensureReciteSyncTable(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS recite_sync (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
      .run();
  } catch {
    // ignore if table already exists
  }
}

export async function getClashPayloadJson<T>(
  db: D1Database | undefined,
  id: string,
): Promise<{ data: T; updatedAt?: string } | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT payload, updated_at FROM clash_control WHERE id = ?")
      .bind(id)
      .first<{ payload?: string; updated_at?: string }>();
    if (!row?.payload) return null;
    const data = JSON.parse(row.payload) as T;
    return { data, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export async function setClashPayloadJson(
  db: D1Database | undefined,
  id: string,
  payload: unknown,
): Promise<void> {
  if (!db) return;
  await db
    .prepare(
      "INSERT OR REPLACE INTO clash_control (id, payload, updated_at) VALUES (?, ?, datetime('now'))",
    )
    .bind(id, JSON.stringify(payload))
    .run();
}
