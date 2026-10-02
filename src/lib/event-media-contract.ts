export const EVENT_MEDIA_BUCKET = "event-media";

export const EVENT_MEDIA_UPLOAD_OPTIONS = {
  contentType: "image/webp",
  upsert: false,
} as const;

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const MAX_INPUT_PIXELS = 16_000_000;
export const COVER_MAX_EDGE = 1200;
export const AVATAR_MAX_EDGE = 400;
export const WEBP_QUALITY = 80;
export const WEBP_RETRY_QUALITY = 60;
export const EVENT_IMAGE_TEMP_PREFIX = "eevents-image-";
export const STALE_EVENT_IMAGE_TEMP_MS = 15 * 60 * 1000;
export const EVENT_MEDIA_LIST_PAGE_SIZE = 100;

const UUID_V4 =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SEGMENT = "[A-Za-z0-9_-]{1,128}";

const NEW_OBJECT_KEY = new RegExp(
  `^(?:covers/${SEGMENT}|avatars/${SEGMENT}/${SEGMENT})/${UUID_V4}\\.webp$`,
);

export function isNewEventMediaObjectKey(value: string): boolean {
  return NEW_OBJECT_KEY.test(value);
}

/** Object keys already stored on a row. User paths and remote URLs are rejected. */
export function isDeletableObjectKey(value: string): boolean {
  if (value.length === 0 || value.length > 300) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (value.includes("\\") || value.includes("..")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return false;
  if (/\s/u.test(value)) return false;
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

export function imageExceedsPixelLimit(
  width: number | undefined,
  height: number | undefined,
): boolean {
  if (!width || !height) return true;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return true;
  if (width < 1 || height < 1) return true;
  return width * height > MAX_INPUT_PIXELS;
}

export function collectReferencedKeys(
  coverKeys: readonly (string | null | undefined)[],
  avatarKeys: readonly (string | null | undefined)[],
): Set<string> {
  const keys = new Set<string>();
  for (const key of [...coverKeys, ...avatarKeys]) {
    if (key) keys.add(key);
  }
  return keys;
}

export function assertDeletionsAreUnreferenced(
  deletions: readonly string[],
  referencedKeys: ReadonlySet<string>,
): void {
  if (deletions.some((key) => referencedKeys.has(key))) {
    throw new Error("Refusing to delete an event-media object that is still referenced.");
  }
}

export function planUnreferencedObjectDeletions(
  objectKeys: readonly string[],
  referencedKeys: ReadonlySet<string>,
): string[] {
  const deletions: string[] = [];
  const seen = new Set<string>();
  for (const key of objectKeys) {
    if (seen.has(key) || referencedKeys.has(key)) continue;
    seen.add(key);
    deletions.push(key);
  }
  assertDeletionsAreUnreferenced(deletions, referencedKeys);
  return deletions;
}

export interface StorageListEntry {
  name: string;
  id: string | null;
}

export function childStoragePrefix(prefix: string, name: string): string | null {
  if (!name || name.startsWith(".")) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (prefix.includes("..") || prefix.startsWith("/")) return null;
  return prefix ? `${prefix}/${name}` : name;
}

/**
 * Walk a bucket listing. Folders have a null id. Page size is supplied by the caller
 * so tests can force a second page without building a 100-item fixture.
 */
export async function collectStorageObjectKeys(
  listPage: (
    prefix: string,
    offset: number,
    limit: number,
  ) => Promise<readonly StorageListEntry[]>,
  pageSize = EVENT_MEDIA_LIST_PAGE_SIZE,
): Promise<string[]> {
  const keys: string[] = [];
  const queue = [""];
  const seenPrefixes = new Set<string>();

  while (queue.length > 0) {
    const prefix = queue.shift() ?? "";
    if (seenPrefixes.has(prefix)) continue;
    seenPrefixes.add(prefix);
    if (prefix.split("/").filter(Boolean).length > 6) continue;

    let offset = 0;
    for (;;) {
      if (offset > 100_000) break;
      const page = await listPage(prefix, offset, pageSize);
      if (page.length === 0) break;
      for (const entry of page) {
        const child = childStoragePrefix(prefix, entry.name);
        if (!child) continue;
        if (entry.id === null) queue.push(child);
        else keys.push(child);
      }
      if (page.length < pageSize) break;
      offset += page.length;
    }
  }

  return keys;
}
