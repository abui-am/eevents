import "server-only";

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { EventMediaError } from "@/lib/event-media-error";
import {
  AVATAR_MAX_EDGE,
  COVER_MAX_EDGE,
  EVENT_IMAGE_TEMP_PREFIX,
  MAX_INPUT_BYTES,
  MAX_INPUT_PIXELS,
  MAX_OUTPUT_BYTES,
  WEBP_QUALITY,
  WEBP_RETRY_QUALITY,
  imageExceedsPixelLimit,
} from "@/lib/event-media-contract";

sharp.cache(false);

export type EventImageVariant = "cover" | "avatar";

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

const SHARP_INPUT = {
  failOn: "warning",
  limitInputPixels: MAX_INPUT_PIXELS,
  animated: false,
  pages: 1,
  sequentialRead: true,
} as const;

export function assertImageInputSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_INPUT_BYTES) {
    throw new EventMediaError("invalid_input");
  }
}

export function serverImageFilename(extension: "upload" | "webp"): string {
  return `${randomUUID()}.${extension}`;
}

/** Request temp directory. The caller never supplies the directory name or file name. */
export async function withEventImageTempDirectory<T>(
  work: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), EVENT_IMAGE_TEMP_PREFIX));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {
      console.error("Event image temporary directory could not be removed.");
    });
  }
}

export async function encodeWebpWithinLimit(
  encode: (quality: number) => Promise<Buffer>,
  maxOutputBytes: number,
): Promise<Buffer> {
  const first = await encode(WEBP_QUALITY);
  if (first.byteLength <= maxOutputBytes) return first;
  const second = await encode(WEBP_RETRY_QUALITY);
  if (second.byteLength <= maxOutputBytes) return second;
  throw new EventMediaError("output_too_large");
}

export async function readUploadedImage(file: File): Promise<Buffer> {
  assertImageInputSize(file.size);
  const bytes = Buffer.from(await file.arrayBuffer());
  assertImageInputSize(bytes.byteLength);
  return bytes;
}

export async function normalizeEventImage(
  bytes: Buffer,
  variant: EventImageVariant,
  options?: { maxOutputBytes?: number },
): Promise<Buffer> {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new EventMediaError("unavailable");
  }
  if (!Buffer.isBuffer(bytes)) throw new EventMediaError("invalid_input");
  assertImageInputSize(bytes.byteLength);

  const requested = options?.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new EventMediaError("invalid_input");
  }
  const maxOutputBytes = Math.min(requested, MAX_OUTPUT_BYTES);
  const maxEdge = variant === "cover" ? COVER_MAX_EDGE : AVATAR_MAX_EDGE;

  return withEventImageTempDirectory(async (directory) => {
    const inputPath = join(directory, serverImageFilename("upload"));
    const outputPath = join(directory, serverImageFilename("webp"));
    await writeFile(inputPath, bytes);
    const output = await normalizeFile(inputPath, maxEdge, maxOutputBytes);
    await writeFile(outputPath, output);
    return output;
  });
}

async function normalizeFile(
  inputPath: string,
  maxEdge: number,
  maxOutputBytes: number,
): Promise<Buffer> {
  const metadata = await sharp(inputPath, SHARP_INPUT).metadata().catch(() => {
    throw new EventMediaError("invalid_input");
  });

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new EventMediaError("invalid_input");
  }
  if ((metadata.pages ?? 1) > 1 || (metadata.delay?.length ?? 0) > 1) {
    throw new EventMediaError("invalid_input");
  }
  if (imageExceedsPixelLimit(metadata.width, metadata.height)) {
    throw new EventMediaError("invalid_input");
  }

  const decoded = await sharp(inputPath, SHARP_INPUT)
    .rotate()
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new EventMediaError("invalid_input");
    });

  if (imageExceedsPixelLimit(decoded.info.width, decoded.info.height)) {
    throw new EventMediaError("invalid_input");
  }

  const cropSide = Math.min(decoded.info.width, decoded.info.height);
  const left = Math.floor((decoded.info.width - cropSide) / 2);
  const top = Math.floor((decoded.info.height - cropSide) / 2);
  const edge = Math.min(cropSide, maxEdge);

  try {
    return await encodeWebpWithinLimit(async (quality) => {
      let pipeline = sharp(decoded.data, {
        failOn: "warning",
        limitInputPixels: MAX_INPUT_PIXELS,
      }).extract({ left, top, width: cropSide, height: cropSide });
      if (edge < cropSide) {
        pipeline = pipeline.resize(edge, edge, {
          fit: "fill",
          withoutEnlargement: true,
        });
      }
      return pipeline.webp({ quality, effort: 4 }).toBuffer();
    }, maxOutputBytes);
  } catch (error) {
    if (error instanceof EventMediaError) throw error;
    throw new EventMediaError("invalid_input");
  }
}
