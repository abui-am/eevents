import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_EDGE,
  COVER_MAX_EDGE,
  MAX_INPUT_BYTES,
  MAX_INPUT_PIXELS,
  MAX_OUTPUT_BYTES,
  WEBP_QUALITY,
  WEBP_RETRY_QUALITY,
  imageExceedsPixelLimit,
} from "@/lib/event-media-contract";
import { EventMediaError } from "@/lib/event-media-error";
import {
  assertImageInputSize,
  encodeWebpWithinLimit,
  normalizeEventImage,
  readUploadedImage,
  serverImageFilename,
  withEventImageTempDirectory,
} from "@/services/image-processing";

async function solidPng(width: number, height: number, color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

async function pixel(bytes: Buffer, x: number, y: number): Promise<number[]> {
  const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const index = (y * decoded.info.width + x) * decoded.info.channels;
  return [...decoded.data.subarray(index, index + 3)];
}

describe("event image limits", () => {
  it("keeps the documented byte, pixel, and WebP quality caps", () => {
    expect(MAX_INPUT_BYTES).toBe(2_097_152);
    expect(MAX_OUTPUT_BYTES).toBe(1_048_576);
    expect(MAX_INPUT_PIXELS).toBe(16_000_000);
    expect(COVER_MAX_EDGE).toBe(1200);
    expect(AVATAR_MAX_EDGE).toBe(400);
    expect(WEBP_QUALITY).toBe(80);
    expect(WEBP_RETRY_QUALITY).toBe(60);
    expect(imageExceedsPixelLimit(4000, 4000)).toBe(false);
    expect(imageExceedsPixelLimit(4001, 4000)).toBe(true);
    expect(() => assertImageInputSize(MAX_INPUT_BYTES)).not.toThrow();
    expect(() => assertImageInputSize(MAX_INPUT_BYTES + 1)).toThrow(EventMediaError);
    expect(() => assertImageInputSize(0)).toThrow(EventMediaError);
  });

  it("rejects an extracted file over 2 MiB before decoding it", async () => {
    const file = new File([new Uint8Array(MAX_INPUT_BYTES + 1)], "too-big.png", {
      type: "image/png",
    });
    await expect(readUploadedImage(file)).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("event image bytes", () => {
  it("rejects a spoofed MIME type, malformed bytes, animation, and an unsupported format", async () => {
    await expect(normalizeEventImage(Buffer.from("not an image"), "cover")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      normalizeEventImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "avatar"),
    ).rejects.toMatchObject({ code: "invalid_input" });

    const frame = await solidPng(8, 8, { r: 255, g: 0, b: 0 });
    const other = await solidPng(8, 8, { r: 0, g: 0, b: 255 });
    const animated = await sharp([frame, other], { join: { animated: true } }).webp().toBuffer();
    await expect(normalizeEventImage(animated, "cover")).rejects.toMatchObject({
      code: "invalid_input",
    });

    const gif = await sharp([frame, other], { join: { animated: true } }).gif().toBuffer();
    await expect(normalizeEventImage(gif, "cover")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      normalizeEventImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>'),
        "cover",
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects an image above 16 megapixels", async () => {
    const oversized = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    expect(oversized.byteLength).toBeLessThanOrEqual(MAX_INPUT_BYTES);
    await expect(normalizeEventImage(oversized, "cover")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("crops a centered square and does not enlarge an image below the variant maximum", async () => {
    const width = 9;
    const height = 3;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        const color = x < 3 ? [255, 0, 0] : x < 6 ? [0, 255, 0] : [0, 0, 255];
        raw[index] = color[0] ?? 0;
        raw[index + 1] = color[1] ?? 0;
        raw[index + 2] = color[2] ?? 0;
      }
    }
    const input = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const avatar = await normalizeEventImage(input, "avatar");
    const avatarMeta = await sharp(avatar).metadata();
    expect(avatarMeta.format).toBe("webp");
    expect(avatarMeta.width).toBe(3);
    expect(avatarMeta.height).toBe(3);
    const center = await pixel(avatar, 1, 1);
    expect(center[1]).toBeGreaterThan(200);
    expect(center[0]).toBeLessThan(40);
    expect(center[2]).toBeLessThan(40);

    const small = await solidPng(10, 4, { r: 20, g: 30, b: 40 });
    const cover = await normalizeEventImage(small, "cover");
    const coverMeta = await sharp(cover).metadata();
    expect(coverMeta.width).toBe(4);
    expect(coverMeta.height).toBe(4);
    expect(cover.byteLength).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);

    const wideAvatar = await solidPng(500, 200, { r: 10, g: 20, b: 30 });
    const wideMeta = await sharp(await normalizeEventImage(wideAvatar, "avatar")).metadata();
    expect(wideMeta.width).toBe(200);
    expect(wideMeta.height).toBe(200);

    const largeAvatar = await solidPng(500, 500, { r: 10, g: 20, b: 30 });
    const largeAvatarMeta = await sharp(await normalizeEventImage(largeAvatar, "avatar")).metadata();
    expect(largeAvatarMeta.width).toBe(400);
    expect(largeAvatarMeta.height).toBe(400);

    const largeCover = await solidPng(1400, 1000, { r: 10, g: 20, b: 30 });
    const largeCoverMeta = await sharp(await normalizeEventImage(largeCover, "cover")).metadata();
    expect(largeCoverMeta.width).toBe(1000);
    expect(largeCoverMeta.height).toBe(1000);
  });

  it("applies EXIF orientation and strips metadata", async () => {
    const width = 40;
    const height = 16;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        const color = x < 20 ? [255, 0, 0] : [0, 0, 255];
        raw[index] = color[0] ?? 0;
        raw[index + 1] = color[1] ?? 0;
        raw[index + 2] = color[2] ?? 0;
      }
    }
    const tagged = await sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer()
      .then((png) => sharp(png).withMetadata({ orientation: 6 }).toBuffer());
    const taggedMeta = await sharp(tagged).metadata();
    expect(taggedMeta.orientation).toBe(6);

    const output = await normalizeEventImage(tagged, "cover");
    const topLeft = await pixel(output, 2, 2);
    const topRight = await pixel(output, 13, 2);
    const bottomLeft = await pixel(output, 2, 13);
    expect(topLeft[0]).toBeGreaterThan(200);
    expect(topRight[0]).toBeGreaterThan(200);
    expect(bottomLeft[2]).toBeGreaterThan(200);
    expect(bottomLeft[0]).toBeLessThan(40);

    const described = await sharp({
      create: { width: 16, height: 12, channels: 3, background: { r: 240, g: 10, b: 10 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: "secret-exif" } } })
      .toBuffer();
    expect((await sharp(described).metadata()).exif?.toString("utf8")).toContain("secret-exif");
    const stripped = await sharp(await normalizeEventImage(described, "avatar")).metadata();
    expect(stripped.format).toBe("webp");
    expect(stripped.exif).toBeUndefined();
    expect(stripped.icc).toBeUndefined();
    expect(stripped.orientation).toBeUndefined();
  });

  it("encodes WebP at quality 80 and retries once at 60", async () => {
    const calls: number[] = [];
    const fitted = await encodeWebpWithinLimit(async (quality) => {
      calls.push(quality);
      return Buffer.alloc(quality === 80 ? 20 : 10);
    }, 15);
    expect(calls).toEqual([80, 60]);
    expect(fitted).toHaveLength(10);

    calls.length = 0;
    await encodeWebpWithinLimit(async (quality) => {
      calls.push(quality);
      return Buffer.alloc(4);
    }, 15);
    expect(calls).toEqual([80]);

    calls.length = 0;
    await expect(
      encodeWebpWithinLimit(async (quality) => {
        calls.push(quality);
        return Buffer.alloc(30);
      }, 15),
    ).rejects.toMatchObject({ code: "output_too_large" });
    expect(calls).toEqual([80, 60]);

    const raw = Buffer.alloc(64 * 64 * 3);
    for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 17) & 255;
    const noisy = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
    const first = await normalizeEventImage(noisy, "avatar");
    const retried = await normalizeEventImage(noisy, "avatar", {
      maxOutputBytes: first.byteLength - 1,
    });
    expect(retried.byteLength).toBeLessThan(first.byteLength);
    expect(retried.byteLength).toBeLessThanOrEqual(first.byteLength - 1);
    await expect(
      normalizeEventImage(noisy, "avatar", { maxOutputBytes: 32 }),
    ).rejects.toMatchObject({ code: "output_too_large" });
  });
});

describe("event image temp files", () => {
  it("uses a server-generated eevents-image- directory and removes it after success or failure", async () => {
    const seen: string[] = [];
    await withEventImageTempDirectory(async (directory) => {
      seen.push(directory);
      expect(directory.startsWith(join(tmpdir(), "eevents-image-"))).toBe(true);
      const filename = serverImageFilename("upload");
      expect(filename).toMatch(/^[0-9a-f-]{36}\.upload$/);
      expect(filename).not.toContain("user-supplied");
      await writeFile(join(directory, filename), Buffer.from("x"));
    });
    expect(seen[0]).toBeTruthy();
    expect(existsSync(seen[0] ?? "")).toBe(false);

    let failedDirectory = "";
    await expect(
      withEventImageTempDirectory(async (directory) => {
        failedDirectory = directory;
        throw new Error("processing failed");
      }),
    ).rejects.toThrow("processing failed");
    expect(existsSync(failedDirectory)).toBe(false);
  });

  it("does not keep a temp directory when the image is rejected", async () => {
    const before = new Set(await readdir(tmpdir()));
    await expect(normalizeEventImage(Buffer.from("nope"), "cover")).rejects.toMatchObject({
      code: "invalid_input",
    });
    const created = (await readdir(tmpdir())).filter(
      (name) => name.startsWith("eevents-image-") && !before.has(name),
    );
    expect(created).toEqual([]);
  });

  it("never uses the caller's filename as a filesystem path", async () => {
    const root = await mkdtemp(join(tmpdir(), "eevents-name-check-"));
    const sentinel = "user-supplied-name.webp";
    try {
      const png = await solidPng(8, 6, { r: 1, g: 2, b: 3 });
      await normalizeEventImage(png, "cover");
      expect(existsSync(join(root, sentinel))).toBe(false);
      expect(existsSync(join(tmpdir(), sentinel))).toBe(false);
      expect(existsSync(join(process.cwd(), sentinel))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
