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

const GALLERY_MIGRATE_KEY = "migrated_legacy_videos_v1";

export async function ensureGalleryTables(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS media_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'photo',
        title TEXT NOT NULL,
        album TEXT NOT NULL DEFAULT '默认相册',
        description TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'public',
        storage_tier TEXT NOT NULL DEFAULT 'cf_d1',
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        file_size INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        asset_url TEXT NOT NULL DEFAULT '',
        asset_id INTEGER DEFAULT NULL,
        chunks_json TEXT NOT NULL DEFAULT '[]',
        has_thumb INTEGER NOT NULL DEFAULT 0,
        poster_url TEXT NOT NULL DEFAULT '',
        downloads INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
      .run();

    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_media_items_vis_created ON media_items(visibility, created_at DESC)",
      )
      .run();

    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS media_blobs (
        media_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (media_id, chunk_index)
      )
    `)
      .run();

    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS media_thumbs (
        media_id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL DEFAULT 'image/webp',
        data BLOB NOT NULL
      )
    `)
      .run();

    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS media_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
      .run();

    const migrated = await db
      .prepare("SELECT value FROM media_meta WHERE key = ?")
      .bind(GALLERY_MIGRATE_KEY)
      .first<{ value?: string }>();

    if (!migrated?.value) {
      const now = Date.now();
      try {
        const legacy = await db
          .prepare(
            "SELECT id, title, description, duration, file_size, poster_url, asset_url, download_count, created_at FROM videos ORDER BY created_at DESC",
          )
          .all<{
            id: string;
            title: string;
            description?: string;
            duration?: number;
            file_size?: number;
            poster_url?: string;
            asset_url: string;
            download_count?: number;
            created_at?: string;
          }>();

        const rows = legacy.results || [];
        for (let i = 0; i < rows.length; i++) {
          const v = rows[i];
          if (!v || !v.asset_url) continue;
          const parsedTs = v.created_at ? Date.parse(v.created_at) : Number.NaN;
          const ts = Number.isFinite(parsedTs) ? parsedTs : now - i * 1000;
          const lower = v.asset_url.toLowerCase();
          const mimeType = lower.endsWith(".mov")
            ? "video/quicktime"
            : lower.endsWith(".webm")
              ? "video/webm"
              : "video/mp4";

          await db
            .prepare(`
              INSERT OR IGNORE INTO media_items
                (id, kind, title, album, description, visibility, storage_tier, mime_type, file_size, width, height, duration, asset_url, asset_id, chunks_json, has_thumb, poster_url, downloads, created_at, updated_at)
              VALUES (?, 'video', ?, '视频精选', ?, 'public', 'gh_single', ?, ?, 0, 0, ?, ?, NULL, '[]', 0, ?, ?, ?, ?)
            `)
            .bind(
              v.id,
              v.title || "视频",
              v.description || "",
              mimeType,
              Number(v.file_size) || 0,
              Number(v.duration) || 0,
              v.asset_url,
              v.poster_url || "",
              Number(v.download_count) || 0,
              ts,
              ts,
            )
            .run();
        }
      } catch {
        // legacy videos table may not exist in fresh/test D1
      }
      await db
        .prepare("INSERT OR REPLACE INTO media_meta (key, value) VALUES (?, ?)")
        .bind(GALLERY_MIGRATE_KEY, String(now))
        .run();
    }
  } catch (err) {
    console.error("ensureGalleryTables error:", err);
  }
}

export async function ensureSubLinksTable(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(`
      CREATE TABLE IF NOT EXISTS sub_temp_links (
        token TEXT PRIMARY KEY,
        airport TEXT NOT NULL DEFAULT 'djjc',
        label TEXT NOT NULL DEFAULT '',
        expires_at INTEGER DEFAULT NULL,
        max_uses INTEGER DEFAULT NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER DEFAULT NULL
      )
    `)
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_sub_temp_links_created ON sub_temp_links(created_at DESC)",
      )
      .run();
  } catch (err) {
    console.error("ensureSubLinksTable error:", err);
  }
}
