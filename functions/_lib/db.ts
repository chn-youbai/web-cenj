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

const PAN_PRESET_SEED_KEY = "seeded_presets_v1";

const PAN_PRESET_FILES = [
  {
    id: "preset_cmfa_2_11_36",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    size: 47605350,
    mime_type: "application/vnd.android.package-archive",
    category: "software",
    visibility: "public",
    storage_tier: "external_link",
    asset_url:
      "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    note: "Clash Meta For Android v2.11.36 (arm64-v8a 官方版)",
  },
  {
    id: "preset_cfma_latest",
    name: "cfma_latest.apk",
    size: 48758784,
    mime_type: "application/vnd.android.package-archive",
    category: "software",
    visibility: "public",
    storage_tier: "external_link",
    asset_url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/cfma_latest.apk",
    note: "CFMA 安卓客户端通用版（官网高速直连）",
  },
  {
    id: "preset_clash_verge_x64",
    name: "Clash.Verge_x64_setup.exe",
    size: 47081062,
    mime_type: "application/octet-stream",
    category: "software",
    visibility: "public",
    storage_tier: "external_link",
    asset_url:
      "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    note: "Clash Verge Windows x64 安装包",
  },
] as const;

export async function ensurePanTables(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS pan_files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        category TEXT NOT NULL DEFAULT 'other',
        visibility TEXT NOT NULL DEFAULT 'public',
        storage_tier TEXT NOT NULL DEFAULT 'cf_d1',
        asset_url TEXT NOT NULL DEFAULT '',
        asset_id INTEGER DEFAULT NULL,
        chunks_json TEXT NOT NULL DEFAULT '[]',
        note TEXT NOT NULL DEFAULT '',
        downloads INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
      .run();

    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_pan_files_vis_created ON pan_files(visibility, created_at DESC)",
      )
      .run();

    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS pan_blobs (
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (file_id, chunk_index)
      )
    `)
      .run();

    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS pan_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
      .run();

    const seeded = await db
      .prepare("SELECT value FROM pan_meta WHERE key = ?")
      .bind(PAN_PRESET_SEED_KEY)
      .first<{ value?: string }>();

    if (!seeded?.value) {
      const now = Date.now();
      for (let i = 0; i < PAN_PRESET_FILES.length; i++) {
        const item = PAN_PRESET_FILES[i];
        if (!item) continue;
        const ts = now - (PAN_PRESET_FILES.length - i) * 1000;
        await db
          .prepare(`
            INSERT OR IGNORE INTO pan_files
              (id, name, size, mime_type, category, visibility, storage_tier, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, 0, ?, ?)
          `)
          .bind(
            item.id,
            item.name,
            item.size,
            item.mime_type,
            item.category,
            item.visibility,
            item.storage_tier,
            item.asset_url,
            item.note,
            ts,
            ts,
          )
          .run();
      }
      await db
        .prepare("INSERT OR REPLACE INTO pan_meta (key, value) VALUES (?, ?)")
        .bind(PAN_PRESET_SEED_KEY, String(now))
        .run();
    }
  } catch (err) {
    console.error("ensurePanTables error:", err);
  }
}
