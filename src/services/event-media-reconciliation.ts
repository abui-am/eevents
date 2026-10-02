import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  EVENT_IMAGE_TEMP_PREFIX,
  STALE_EVENT_IMAGE_TEMP_MS,
} from "@/lib/event-media-contract";

const TEMP_DIRECTORY_NAME = /^eevents-image-[A-Za-z0-9_-]+$/;

export function isStaleEventImageTempDirectory(
  name: string,
  modifiedAtMs: number,
  nowMs: number,
): boolean {
  if (!TEMP_DIRECTORY_NAME.test(name) || !name.startsWith(EVENT_IMAGE_TEMP_PREFIX)) {
    return false;
  }
  return nowMs - modifiedAtMs > STALE_EVENT_IMAGE_TEMP_MS;
}

export async function reconcileEventImageTempDirectories(options: {
  root: string;
  now: Date;
  apply: boolean;
}): Promise<{ stale: string[]; kept: string[]; deleted: string[] }> {
  const root = await realpath(options.root);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  const entries = await readdir(root, { withFileTypes: true });
  const stale: string[] = [];
  const kept: string[] = [];
  const deleted: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.includes(sep) || entry.name.includes("/")) {
      continue;
    }
    if (!entry.name.startsWith(EVENT_IMAGE_TEMP_PREFIX)) continue;

    const full = resolve(root, entry.name);
    if (!full.startsWith(rootPrefix)) continue;
    const stats = await lstat(full);
    if (!stats.isDirectory()) continue;

    if (!isStaleEventImageTempDirectory(entry.name, stats.mtimeMs, options.now.getTime())) {
      kept.push(entry.name);
      continue;
    }

    stale.push(entry.name);
    if (!options.apply) continue;
    await rm(full, { recursive: true, force: true });
    deleted.push(entry.name);
  }

  return { stale, kept, deleted };
}
