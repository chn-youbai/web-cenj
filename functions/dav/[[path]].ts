import { ensurePanTables } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import {
  ensureFolderHierarchy,
  recordPanApiKeyUsage,
  resolvePanAuth,
  sanitizeFolderPath,
} from "../_lib/pan-auth";
import {
  CF_D1_MAX_BYTES,
  type PanFileRow,
  deletePanFileRecord,
  generatePanId,
  inferPanCategory,
  saveD1Blobs,
  streamPanFileResponse,
  uploadStreamToGitHub,
} from "../_lib/pan-storage";

const DAV_METHODS = "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE";
const DAV_PUT_MAX_BYTES = 90 * 1024 * 1024;

interface DavParsedTarget {
  ok: true;
  scope: "root" | "space" | "entry";
  visibility?: "public" | "private";
  subPath: string;
  parentPath: string;
  entryName: string;
  trailingSlash: boolean;
}

function parseDavPathname(
  pathname: string,
): DavParsedTarget | { ok: false; status: number; error: string } {
  const davIdx = pathname.indexOf("/dav");
  if (davIdx < 0) {
    return { ok: false, status: 404, error: "Invalid WebDAV path" };
  }
  const rawRest = pathname.slice(davIdx + 4);
  const trailingSlash = rawRest === "" || rawRest.endsWith("/");
  const rawSegments = rawRest.split("/").filter((s) => s.length > 0 && s !== ".");

  const decodedSegments: string[] = [];
  for (const seg of rawSegments) {
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return { ok: false, status: 400, error: "Invalid URI encoding" };
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      return { ok: false, status: 400, error: "Invalid path segment" };
    }
    decodedSegments.push(decoded);
  }

  if (decodedSegments.length === 0) {
    return {
      ok: true,
      scope: "root",
      subPath: "",
      parentPath: "",
      entryName: "",
      trailingSlash: true,
    };
  }

  const rootSpace = decodedSegments[0];
  if (rootSpace !== "public" && rootSpace !== "private") {
    return { ok: false, status: 404, error: "Only /dav/public and /dav/private spaces exist" };
  }

  const visibility = rootSpace;
  const inner = decodedSegments.slice(1);
  if (inner.length === 0) {
    return {
      ok: true,
      scope: "space",
      visibility,
      subPath: "",
      parentPath: "",
      entryName: "",
      trailingSlash: true,
    };
  }

  const subPath = inner.join("/");
  const parentPath = inner.slice(0, -1).join("/");
  const entryName = inner[inner.length - 1] || "";
  return {
    ok: true,
    scope: "entry",
    visibility,
    subPath,
    parentPath,
    entryName,
    trailingSlash,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDavHref(segments: string[], isDir: boolean): string {
  const encoded = segments.map((s) => encodeURIComponent(s)).join("/");
  if (!encoded) return "/dav/";
  return isDir ? `/dav/${encoded}/` : `/dav/${encoded}`;
}

function formatHttpDate(ts: number): string {
  const safeTs = ts > 0 ? ts : Date.now();
  return new Date(safeTs).toUTCString();
}

function formatIsoDate(ts: number): string {
  const safeTs = ts > 0 ? ts : Date.now();
  return new Date(safeTs).toISOString();
}

interface DavPropEntry {
  href: string;
  displayName: string;
  isDir: boolean;
  size: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  etag: string;
}

function renderPropfindXml(entries: DavPropEntry[]): string {
  const responses = entries
    .map((entry) => {
      const resourceType = entry.isDir ? "<D:collection/>" : "";
      const sizeXml = entry.isDir
        ? ""
        : `<D:getcontentlength>${Math.max(0, entry.size)}</D:getcontentlength>`;
      const typeXml = entry.isDir
        ? ""
        : `<D:getcontenttype>${escapeXml(entry.mimeType || "application/octet-stream")}</D:getcontenttype>`;
      return `  <D:response>
    <D:href>${escapeXml(entry.href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(entry.displayName)}</D:displayname>
        <D:resourcetype>${resourceType}</D:resourcetype>
        ${sizeXml}
        ${typeXml}
        <D:getlastmodified>${escapeXml(formatHttpDate(entry.updatedAt))}</D:getlastmodified>
        <D:creationdate>${escapeXml(formatIsoDate(entry.createdAt))}</D:creationdate>
        <D:getetag>${escapeXml(entry.etag)}</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses}
</D:multistatus>`;
}

function davCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": DAV_METHODS,
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Depth, Destination, Overwrite, Range, X-API-Key",
    DAV: "1, 2",
    "MS-Author-Via": "DAV",
  };
}

function davUnauthorized(message = "Authentication required"): Response {
  return new Response(message, {
    status: 401,
    headers: {
      ...davCorsHeaders(),
      "WWW-Authenticate": 'Basic realm="Cenj Pan WebDAV"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function davText(
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const responseBody = status === 204 || status === 205 || status === 304 ? null : body;
  return new Response(responseBody, {
    status,
    headers: {
      ...davCorsHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function folderExists(
  db: D1Database,
  visibility: "public" | "private",
  folderPath: string,
): Promise<boolean> {
  if (!folderPath) return true;
  const direct = await db
    .prepare("SELECT path FROM pan_folders WHERE visibility = ? AND path = ?")
    .bind(visibility, folderPath)
    .first<{ path?: string }>();
  if (direct?.path) return true;

  const hasExactFiles = await db
    .prepare("SELECT id FROM pan_files WHERE visibility = ? AND folder_path = ? LIMIT 1")
    .bind(visibility, folderPath)
    .first<{ id?: string }>();
  if (hasExactFiles?.id) return true;

  const hasSubFiles = await db
    .prepare("SELECT id FROM pan_files WHERE visibility = ? AND folder_path LIKE ? LIMIT 1")
    .bind(visibility, `${folderPath}/%`)
    .first<{ id?: string }>();
  return Boolean(hasSubFiles?.id);
}

async function listFolderChildren(
  db: D1Database,
  visibility: "public" | "private",
  folderPath: string,
): Promise<{ childFolders: Array<{ name: string; createdAt: number }>; childFiles: PanFileRow[] }> {
  const childFolderMap = new Map<string, number>();

  const { results: folderRows } = await db
    .prepare("SELECT path, created_at FROM pan_folders WHERE visibility = ?")
    .bind(visibility)
    .all<{ path: string; created_at: number }>();

  const prefix = folderPath ? `${folderPath}/` : "";
  for (const row of folderRows || []) {
    if (!row.path) continue;
    if (prefix && !row.path.startsWith(prefix)) continue;
    const rel = prefix ? row.path.slice(prefix.length) : row.path;
    const firstPart = rel.split("/")[0];
    if (firstPart && !childFolderMap.has(firstPart)) {
      childFolderMap.set(firstPart, Number(row.created_at) || Date.now());
    }
  }

  const { results: allSpaceFiles } = await db
    .prepare("SELECT * FROM pan_files WHERE visibility = ? ORDER BY name ASC")
    .bind(visibility)
    .all<PanFileRow>();

  const childFiles: PanFileRow[] = [];
  for (const f of allSpaceFiles || []) {
    const fFolder = f.folder_path || "";
    if (fFolder === folderPath) {
      childFiles.push(f);
      continue;
    }
    if (prefix && !fFolder.startsWith(prefix)) continue;
    const rel = prefix ? fFolder.slice(prefix.length) : fFolder;
    const firstPart = rel.split("/")[0];
    if (firstPart && !childFolderMap.has(firstPart)) {
      childFolderMap.set(firstPart, Number(f.created_at) || Date.now());
    }
  }

  const childFolders = Array.from(childFolderMap.entries())
    .map(([name, createdAt]) => ({ name, createdAt }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { childFolders, childFiles };
}

async function copyD1Blobs(db: D1Database, srcFileId: string, dstFileId: string): Promise<void> {
  const { results } = await db
    .prepare("SELECT chunk_index, data FROM pan_blobs WHERE file_id = ? ORDER BY chunk_index ASC")
    .bind(srcFileId)
    .all<{ chunk_index: number; data: unknown }>();
  for (const row of results || []) {
    await db
      .prepare("INSERT INTO pan_blobs (file_id, chunk_index, data) VALUES (?, ?, ?)")
      .bind(dstFileId, row.chunk_index, row.data)
      .run();
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...davCorsHeaders(),
        Allow: DAV_METHODS,
      },
    });
  }

  const db = context.env.DB;
  if (!db) {
    return davText(503, "Cloudflare D1 database not bound");
  }
  await ensurePanTables(db);

  const authCtx = await resolvePanAuth(context.env, context.request);
  if (!authCtx.authenticated) {
    if (authCtx.authStatus === 403) {
      return davText(403, authCtx.authError || "Forbidden");
    }
    return davUnauthorized(
      authCtx.authError || "WebDAV requires a valid API Key or Admin password",
    );
  }
  recordPanApiKeyUsage(context, authCtx);

  const url = new URL(context.request.url);
  const parsed = parseDavPathname(url.pathname);
  if (!parsed.ok) {
    return davText(parsed.status, parsed.error);
  }

  if (parsed.visibility === "private" && !authCtx.canPrivate) {
    return davText(403, "API Key lacks private space permission");
  }

  // ---------- PROPFIND ----------
  if (method === "PROPFIND") {
    if (!authCtx.canRead) return davText(403, "API Key lacks read permission");
    const depthRaw = (context.request.headers.get("Depth") || "1").trim().toLowerCase();
    const depth = depthRaw === "0" ? 0 : 1;

    if (parsed.scope === "root") {
      const entries: DavPropEntry[] = [
        {
          href: "/dav/",
          displayName: "dav",
          isDir: true,
          size: 0,
          mimeType: "httpd/unix-directory",
          createdAt: 0,
          updatedAt: Date.now(),
          etag: '"dav-root"',
        },
      ];
      if (depth > 0) {
        entries.push({
          href: "/dav/public/",
          displayName: "public",
          isDir: true,
          size: 0,
          mimeType: "httpd/unix-directory",
          createdAt: 0,
          updatedAt: Date.now(),
          etag: '"dav-public"',
        });
        if (authCtx.canPrivate) {
          entries.push({
            href: "/dav/private/",
            displayName: "private",
            isDir: true,
            size: 0,
            mimeType: "httpd/unix-directory",
            createdAt: 0,
            updatedAt: Date.now(),
            etag: '"dav-private"',
          });
        }
      }
      return new Response(renderPropfindXml(entries), {
        status: 207,
        headers: {
          ...davCorsHeaders(),
          "Content-Type": "application/xml; charset=utf-8",
        },
      });
    }

    const vis = parsed.visibility!;
    const currentFolder = parsed.subPath;

    // Check if targeting a file (only when scope === "entry" and not trailing slash)
    if (parsed.scope === "entry" && !parsed.trailingSlash) {
      const fileRow = await db
        .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
        .bind(vis, parsed.parentPath, parsed.entryName)
        .first<PanFileRow>();
      if (fileRow) {
        const segs = [
          vis,
          ...(parsed.parentPath ? parsed.parentPath.split("/") : []),
          fileRow.name,
        ];
        const entry: DavPropEntry = {
          href: buildDavHref(segs, false),
          displayName: fileRow.name,
          isDir: false,
          size: Number(fileRow.size) || 0,
          mimeType: fileRow.mime_type || "application/octet-stream",
          createdAt: Number(fileRow.created_at) || 0,
          updatedAt: Number(fileRow.updated_at) || 0,
          etag: `"${fileRow.id}-${fileRow.updated_at || 0}"`,
        };
        return new Response(renderPropfindXml([entry]), {
          status: 207,
          headers: {
            ...davCorsHeaders(),
            "Content-Type": "application/xml; charset=utf-8",
          },
        });
      }
    }

    if (parsed.scope === "entry") {
      const exists = await folderExists(db, vis, currentFolder);
      if (!exists) {
        return davText(404, "Not Found");
      }
    }

    const segs = [vis, ...(currentFolder ? currentFolder.split("/") : [])];
    const entries: DavPropEntry[] = [
      {
        href: buildDavHref(segs, true),
        displayName: currentFolder ? parsed.entryName : vis,
        isDir: true,
        size: 0,
        mimeType: "httpd/unix-directory",
        createdAt: 0,
        updatedAt: Date.now(),
        etag: `"dir-${vis}-${currentFolder}"`,
      },
    ];

    if (depth > 0) {
      const { childFolders, childFiles } = await listFolderChildren(db, vis, currentFolder);
      for (const dir of childFolders) {
        entries.push({
          href: buildDavHref([...segs, dir.name], true),
          displayName: dir.name,
          isDir: true,
          size: 0,
          mimeType: "httpd/unix-directory",
          createdAt: dir.createdAt,
          updatedAt: dir.createdAt,
          etag: `"dir-${vis}-${currentFolder}/${dir.name}"`,
        });
      }
      for (const f of childFiles) {
        entries.push({
          href: buildDavHref([...segs, f.name], false),
          displayName: f.name,
          isDir: false,
          size: Number(f.size) || 0,
          mimeType: f.mime_type || "application/octet-stream",
          createdAt: Number(f.created_at) || 0,
          updatedAt: Number(f.updated_at) || 0,
          etag: `"${f.id}-${f.updated_at || 0}"`,
        });
      }
    }

    return new Response(renderPropfindXml(entries), {
      status: 207,
      headers: {
        ...davCorsHeaders(),
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  }

  // ---------- GET / HEAD ----------
  if (method === "GET" || method === "HEAD") {
    if (!authCtx.canRead) return davText(403, "API Key lacks read permission");
    if (parsed.scope !== "entry") {
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers: davCorsHeaders() });
      }
      return davText(200, "Cenj Pan WebDAV Collection");
    }

    const vis = parsed.visibility!;
    const fileRow = await db
      .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
      .bind(vis, parsed.parentPath, parsed.entryName)
      .first<PanFileRow>();

    if (!fileRow) {
      if (await folderExists(db, vis, parsed.subPath)) {
        return method === "HEAD"
          ? new Response(null, { status: 200, headers: davCorsHeaders() })
          : davText(200, `Directory: /${vis}/${parsed.subPath}`);
      }
      return davText(404, "File Not Found");
    }

    return streamPanFileResponse(context, fileRow, {
      isHead: method === "HEAD",
      inline: false,
      corsHeaders: davCorsHeaders(),
      redirectExternalFallback: false,
    });
  }

  // ---------- MKCOL ----------
  if (method === "MKCOL") {
    if (!authCtx.canWrite) return davText(403, "API Key lacks write permission");
    if (parsed.scope !== "entry") {
      return davText(405, "Collection already exists");
    }
    const vis = parsed.visibility!;
    const existingFile = await db
      .prepare("SELECT id FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
      .bind(vis, parsed.parentPath, parsed.entryName)
      .first<{ id?: string }>();
    if (existingFile?.id) {
      return davText(405, "A file with the same name already exists");
    }
    if (await folderExists(db, vis, parsed.subPath)) {
      return davText(405, "Directory already exists");
    }

    await ensureFolderHierarchy(db, vis, parsed.subPath, Date.now());
    return davText(201, "Created");
  }

  // ---------- PUT ----------
  if (method === "PUT") {
    if (!authCtx.canWrite) return davText(403, "API Key lacks write permission");
    if (parsed.scope !== "entry" || parsed.trailingSlash) {
      return davText(405, "Cannot PUT to a directory");
    }

    const vis = parsed.visibility!;
    if (await folderExists(db, vis, parsed.subPath)) {
      return davText(409, "A directory already exists at this path");
    }

    const declaredSize =
      Number.parseInt(context.request.headers.get("Content-Length") || "0", 10) || 0;
    if (declaredSize > DAV_PUT_MAX_BYTES) {
      return davText(
        413,
        "WebDAV PUT supports up to 90 MB per file; use chunked REST upload for larger files",
      );
    }

    const existing = await db
      .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
      .bind(vis, parsed.parentPath, parsed.entryName)
      .first<PanFileRow>();

    if (context.request.headers.get("If-None-Match") === "*" && existing) {
      return davText(412, "Precondition Failed");
    }

    const mimeType =
      context.request.headers.get("Content-Type")?.trim() || "application/octet-stream";
    const category = inferPanCategory(parsed.entryName, mimeType);
    const now = Date.now();

    if (parsed.parentPath) {
      await ensureFolderHierarchy(db, vis, parsed.parentPath, now);
    }

    if (declaredSize <= CF_D1_MAX_BYTES) {
      const buf = await context.request.arrayBuffer();
      const actualSize = buf.byteLength;
      if (actualSize > CF_D1_MAX_BYTES) {
        return davText(413, "Missing accurate Content-Length for >20MB upload");
      }

      if (existing) {
        await deletePanFileRecord(db, context.env, existing, (p) => context.waitUntil(p));
      }

      const id = generatePanId();
      await saveD1Blobs(db, id, new Uint8Array(buf));
      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'cf_d1', ?, '', NULL, '[]', '', 0, ?, ?)
        `)
        .bind(
          id,
          parsed.entryName,
          actualSize,
          mimeType,
          category,
          vis,
          parsed.parentPath,
          now,
          now,
        )
        .run();

      return davText(existing ? 204 : 201, existing ? "" : "Created", {
        ETag: `"${id}-${now}"`,
      });
    }

    const token = getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
    if (!token) {
      return davText(503, "Uploading >20MB via WebDAV requires GITHUB_MEDIA_TOKEN");
    }

    if (existing) {
      await deletePanFileRecord(db, context.env, existing, (p) => context.waitUntil(p));
    }

    const id = generatePanId();
    const uploaded = await uploadStreamToGitHub(
      token,
      parsed.entryName,
      mimeType,
      context.request.body,
    );
    const finalSize = uploaded.size || declaredSize;

    await db
      .prepare(`
        INSERT INTO pan_files
          (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'gh_single', ?, ?, ?, '[]', '', 0, ?, ?)
      `)
      .bind(
        id,
        parsed.entryName,
        finalSize,
        mimeType,
        category,
        vis,
        parsed.parentPath,
        uploaded.url,
        uploaded.assetId,
        now,
        now,
      )
      .run();

    return davText(existing ? 204 : 201, existing ? "" : "Created", {
      ETag: `"${id}-${now}"`,
    });
  }

  // ---------- DELETE ----------
  if (method === "DELETE") {
    if (!authCtx.canDelete) return davText(403, "API Key lacks delete permission");
    if (parsed.scope !== "entry") {
      return davText(405, "Cannot delete root or top-level space");
    }
    const vis = parsed.visibility!;
    const existingFile = await db
      .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
      .bind(vis, parsed.parentPath, parsed.entryName)
      .first<PanFileRow>();

    if (existingFile) {
      await deletePanFileRecord(db, context.env, existingFile, (p) => context.waitUntil(p));
      return new Response(null, { status: 204, headers: davCorsHeaders() });
    }

    if (await folderExists(db, vis, parsed.subPath)) {
      const { results } = await db
        .prepare(
          "SELECT * FROM pan_files WHERE visibility = ? AND (folder_path = ? OR folder_path LIKE ?)",
        )
        .bind(vis, parsed.subPath, `${parsed.subPath}/%`)
        .all<PanFileRow>();
      for (const row of results || []) {
        await deletePanFileRecord(db, context.env, row, (p) => context.waitUntil(p));
      }
      await db
        .prepare("DELETE FROM pan_folders WHERE visibility = ? AND (path = ? OR path LIKE ?)")
        .bind(vis, parsed.subPath, `${parsed.subPath}/%`)
        .run();
      return new Response(null, { status: 204, headers: davCorsHeaders() });
    }

    return davText(404, "Not Found");
  }

  // ---------- MOVE / COPY ----------
  if (method === "MOVE" || method === "COPY") {
    if (!authCtx.canRead || !authCtx.canWrite) {
      return davText(403, "API Key lacks read/write permission");
    }
    if (method === "MOVE" && !authCtx.canDelete) {
      return davText(403, "MOVE requires delete permission");
    }
    if (parsed.scope !== "entry") {
      return davText(405, "Cannot move or copy top-level space");
    }

    const destHeader = (context.request.headers.get("Destination") || "").trim();
    if (!destHeader) {
      return davText(400, "Missing Destination header");
    }

    let destPathname = destHeader;
    if (/^https?:\/\//i.test(destHeader)) {
      try {
        destPathname = new URL(destHeader).pathname;
      } catch {
        return davText(400, "Invalid Destination URL");
      }
    }

    const destParsed = parseDavPathname(destPathname);
    if (!destParsed.ok || destParsed.scope !== "entry") {
      return davText(403, "Invalid Destination path");
    }
    const srcVis = parsed.visibility!;
    const dstVis = destParsed.visibility!;
    if (dstVis === "private" && !authCtx.canPrivate) {
      return davText(403, "API Key lacks private space permission");
    }

    const overwrite = (context.request.headers.get("Overwrite") || "T").toUpperCase() !== "F";
    const now = Date.now();

    const srcFile = await db
      .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
      .bind(srcVis, parsed.parentPath, parsed.entryName)
      .first<PanFileRow>();

    if (srcFile) {
      if (await folderExists(db, dstVis, destParsed.subPath)) {
        return davText(409, "Destination is an existing directory");
      }
      const dstExisting = await db
        .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
        .bind(dstVis, destParsed.parentPath, destParsed.entryName)
        .first<PanFileRow>();

      if (dstExisting && !overwrite) {
        return davText(412, "Destination already exists");
      }
      if (dstExisting) {
        await deletePanFileRecord(db, context.env, dstExisting, (p) => context.waitUntil(p));
      }

      if (destParsed.parentPath) {
        await ensureFolderHierarchy(db, dstVis, destParsed.parentPath, now);
      }

      if (method === "MOVE") {
        await db
          .prepare(
            "UPDATE pan_files SET visibility = ?, folder_path = ?, name = ?, updated_at = ? WHERE id = ?",
          )
          .bind(dstVis, destParsed.parentPath, destParsed.entryName, now, srcFile.id)
          .run();
      } else {
        const newId = generatePanId();
        if (srcFile.storage_tier === "cf_d1") {
          await copyD1Blobs(db, srcFile.id, newId);
        }
        await db
          .prepare(`
            INSERT INTO pan_files
              (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
          `)
          .bind(
            newId,
            destParsed.entryName,
            srcFile.size,
            srcFile.mime_type,
            srcFile.category,
            dstVis,
            srcFile.storage_tier,
            destParsed.parentPath,
            srcFile.asset_url,
            srcFile.chunks_json,
            srcFile.note,
            now,
            now,
          )
          .run();
      }

      return davText(dstExisting ? 204 : 201, dstExisting ? "" : "Created");
    }

    // Folder MOVE / COPY
    if (!(await folderExists(db, srcVis, parsed.subPath))) {
      return davText(404, "Source not found");
    }
    const dstFolderCheck = sanitizeFolderPath(destParsed.subPath);
    if (!dstFolderCheck.ok) {
      return davText(400, dstFolderCheck.error);
    }

    const dstAlreadyExists = await folderExists(db, dstVis, destParsed.subPath);
    if (dstAlreadyExists && !overwrite) {
      return davText(412, "Destination directory already exists");
    }

    await ensureFolderHierarchy(db, dstVis, destParsed.subPath, now);

    const { results: srcFolders } = await db
      .prepare("SELECT path FROM pan_folders WHERE visibility = ? AND (path = ? OR path LIKE ?)")
      .bind(srcVis, parsed.subPath, `${parsed.subPath}/%`)
      .all<{ path: string }>();

    for (const f of srcFolders || []) {
      const suffix = f.path.slice(parsed.subPath.length);
      const nextPath = `${destParsed.subPath}${suffix}`;
      await db
        .prepare(
          "INSERT OR IGNORE INTO pan_folders (visibility, path, created_at) VALUES (?, ?, ?)",
        )
        .bind(dstVis, nextPath, now)
        .run();
    }

    const { results: srcFiles } = await db
      .prepare(
        "SELECT * FROM pan_files WHERE visibility = ? AND (folder_path = ? OR folder_path LIKE ?)",
      )
      .bind(srcVis, parsed.subPath, `${parsed.subPath}/%`)
      .all<PanFileRow>();

    for (const file of srcFiles || []) {
      const suffix = (file.folder_path || "").slice(parsed.subPath.length);
      const nextFolder = `${destParsed.subPath}${suffix}`;
      if (method === "MOVE") {
        await db
          .prepare(
            "UPDATE pan_files SET visibility = ?, folder_path = ?, updated_at = ? WHERE id = ?",
          )
          .bind(dstVis, nextFolder, now, file.id)
          .run();
      } else {
        const newId = generatePanId();
        if (file.storage_tier === "cf_d1") {
          await copyD1Blobs(db, file.id, newId);
        }
        await db
          .prepare(`
            INSERT INTO pan_files
              (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
          `)
          .bind(
            newId,
            file.name,
            file.size,
            file.mime_type,
            file.category,
            dstVis,
            file.storage_tier,
            nextFolder,
            file.asset_url,
            file.chunks_json,
            file.note,
            now,
            now,
          )
          .run();
      }
    }

    if (method === "MOVE") {
      await db
        .prepare("DELETE FROM pan_folders WHERE visibility = ? AND (path = ? OR path LIKE ?)")
        .bind(srcVis, parsed.subPath, `${parsed.subPath}/%`)
        .run();
    }

    return davText(dstAlreadyExists ? 204 : 201, dstAlreadyExists ? "" : "Created");
  }

  return davText(405, `Method ${method} not allowed`, { Allow: DAV_METHODS });
};
