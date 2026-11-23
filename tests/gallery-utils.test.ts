import {
  AERIAL_ALBUM_NAME,
  type GalleryDisplayItem,
  MEDIA_CF_D1_LIMIT,
  MEDIA_GH_SINGLE_LIMIT,
  detectMediaKind,
  filterGalleryItems,
  formatDuration,
  formatFileSize,
  selectMediaTier,
} from "@/pages/gallery/utils";
import { describe, expect, it } from "vitest";

describe("gallery utils", () => {
  it("routes <=20MB to cf_d1, 20-90MB to gh_single, >90MB to gh_chunked", () => {
    expect(selectMediaTier(1024)).toBe("cf_d1");
    expect(selectMediaTier(MEDIA_CF_D1_LIMIT)).toBe("cf_d1");
    expect(selectMediaTier(MEDIA_CF_D1_LIMIT + 1)).toBe("gh_single");
    expect(selectMediaTier(MEDIA_GH_SINGLE_LIMIT)).toBe("gh_single");
    expect(selectMediaTier(MEDIA_GH_SINGLE_LIMIT + 1)).toBe("gh_chunked");
  });

  it("detects photo and video files accurately and rejects unrelated files", () => {
    expect(detectMediaKind({ name: "sunset.webp", type: "image/webp" })).toBe("photo");
    expect(detectMediaKind({ name: "IMG_001.HEIC", type: "" })).toBe("photo");
    expect(detectMediaKind({ name: "clip.mov", type: "video/quicktime" })).toBe("video");
    expect(detectMediaKind({ name: "archive.zip", type: "application/zip" })).toBeNull();
  });

  it("formats durations and sizes cleanly", () => {
    expect(formatDuration(65)).toBe("01:05");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });

  it("filters gallery items by kind, album, visibility, and search query", () => {
    const items: GalleryDisplayItem[] = [
      {
        source: "static",
        id: "a1",
        kind: "photo",
        title: "航拍精选 No.01",
        album: AERIAL_ALBUM_NAME,
        description: "",
        visibility: "public",
        thumbUrl: "",
        fullUrl: "",
        downloadUrl: "",
        fileSize: 0,
        width: 0,
        height: 0,
        duration: 0,
        createdAt: 0,
      },
      {
        source: "cloud",
        id: "v1",
        kind: "video",
        title: "夕阳海边",
        album: "旅行记忆",
        description: "4K 航拍",
        visibility: "private",
        thumbUrl: "",
        fullUrl: "",
        downloadUrl: "",
        fileSize: 12000,
        width: 1920,
        height: 1080,
        duration: 18,
        createdAt: 100,
      },
    ];

    expect(
      filterGalleryItems(items, {
        kind: "video",
        album: "all",
        visibility: "private",
        query: "夕阳",
      }).map((i) => i.id),
    ).toEqual(["v1"]);

    expect(
      filterGalleryItems(items, {
        kind: "all",
        album: AERIAL_ALBUM_NAME,
        visibility: "all",
        query: "",
      }).map((i) => i.id),
    ).toEqual(["a1"]);
  });
});
