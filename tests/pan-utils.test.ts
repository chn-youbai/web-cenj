import {
  PAN_CF_D1_LIMIT,
  PAN_GH_SINGLE_LIMIT,
  filterAndSortPanFiles,
  formatFileSize,
  getPreviewKind,
  inferPanCategory,
  selectUploadTier,
} from "@/pages/pan/utils";
import type { PanFileItem } from "@shared/types";
import { describe, expect, it } from "vitest";

describe("pan utils", () => {
  it("routes <=20MB to cf_d1, 20-90MB to gh_single, >90MB to gh_chunked", () => {
    expect(selectUploadTier(1024)).toBe("cf_d1");
    expect(selectUploadTier(PAN_CF_D1_LIMIT)).toBe("cf_d1");
    expect(selectUploadTier(PAN_CF_D1_LIMIT + 1)).toBe("gh_single");
    expect(selectUploadTier(PAN_GH_SINGLE_LIMIT)).toBe("gh_single");
    expect(selectUploadTier(PAN_GH_SINGLE_LIMIT + 1)).toBe("gh_chunked");
  });

  it("infers file categories accurately from extension and MIME", () => {
    expect(inferPanCategory("Clash.Verge_x64_setup.exe")).toBe("software");
    expect(inferPanCategory("notes.md", "text/markdown")).toBe("document");
    expect(inferPanCategory("photo.webp", "image/webp")).toBe("image");
    expect(inferPanCategory("backup.tar.gz")).toBe("archive");
    expect(inferPanCategory("clip.mp4", "video/mp4")).toBe("media");
    expect(inferPanCategory("mystery.bin")).toBe("other");
  });

  it("detects inline preview kinds and disables preview for external links", () => {
    expect(getPreviewKind("a.png", "image/png", 50000, "cf_d1")).toBe("image");
    expect(getPreviewKind("readme.md", "text/plain", 4096, "cf_d1")).toBe("text");
    expect(getPreviewKind("doc.pdf", "application/pdf", 1024 * 1024, "cf_d1")).toBe("pdf");
    expect(getPreviewKind("a.png", "image/png", 50000, "external_link")).toBe("none");
    expect(getPreviewKind("huge.log", "text/plain", 5 * 1024 * 1024, "cf_d1")).toBe("none");
  });

  it("formats file sizes and filters/sorts file items", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(15 * 1024 * 1024)).toBe("15.0 MB");

    const items: PanFileItem[] = [
      {
        id: "1",
        name: "alpha.pdf",
        size: 1000,
        mime_type: "application/pdf",
        category: "document",
        visibility: "public",
        storage_tier: "cf_d1",
        asset_url: "",
        note: "说明文档",
        downloads: 2,
        created_at: 100,
        updated_at: 100,
      },
      {
        id: "2",
        name: "beta.apk",
        size: 5000,
        mime_type: "application/vnd.android.package-archive",
        category: "software",
        visibility: "private",
        storage_tier: "gh_single",
        asset_url: "https://example.com/beta.apk",
        note: "内测版",
        downloads: 10,
        created_at: 200,
        updated_at: 200,
      },
    ];

    expect(
      filterAndSortPanFiles(items, {
        query: "文档",
        category: "all",
        visibility: "all",
        sortBy: "newest",
      }).map((i) => i.id),
    ).toEqual(["1"]);

    expect(
      filterAndSortPanFiles(items, {
        query: "",
        category: "all",
        visibility: "private",
        sortBy: "downloads",
      }).map((i) => i.id),
    ).toEqual(["2"]);
  });
});
