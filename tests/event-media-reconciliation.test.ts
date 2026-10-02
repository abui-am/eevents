import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import {
  STALE_EVENT_IMAGE_TEMP_MS,
  assertDeletionsAreUnreferenced,
  collectReferencedKeys,
  collectStorageObjectKeys,
  isDeletableObjectKey,
  planUnreferencedObjectDeletions,
} from "@/lib/event-media-contract";
import {
  isStaleEventImageTempDirectory,
  reconcileEventImageTempDirectories,
} from "@/services/event-media-reconciliation";

describe("event media reconciliation", () => {
  it("plans deletion of unreferenced objects and refuses a live key", () => {
    const referenced = collectReferencedKeys(
      ["covers/live.webp", null],
      ["avatars/live.webp", undefined],
    );
    expect(
      planUnreferencedObjectDeletions(
        ["covers/live.webp", "covers/orphan.webp", "avatars/live.webp", "covers/orphan.webp"],
        referenced,
      ),
    ).toEqual(["covers/orphan.webp"]);
    expect(() => assertDeletionsAreUnreferenced(["covers/live.webp"], referenced)).toThrow(
      "Refusing to delete an event-media object that is still referenced.",
    );
    expect(isDeletableObjectKey("../certificates/secret.pdf")).toBe(false);
    expect(isDeletableObjectKey("https://cdn.example/cover.webp")).toBe(false);
    expect(isDeletableObjectKey("covers/event/north.webp")).toBe(true);
  });

  it("walks storage folders and a second page without treating folders as objects", async () => {
    const keys = await collectStorageObjectKeys(async (prefix, offset) => {
      if (prefix === "" && offset === 0) return [{ name: "covers", id: null }];
      if (prefix === "covers" && offset === 0) {
        return [
          { name: "event", id: null },
          { name: ".emptyFolderPlaceholder", id: "placeholder" },
          { name: "../escape.webp", id: "bad" },
        ];
      }
      if (prefix === "covers/event" && offset === 0) {
        return [{ name: "kept.webp", id: "file-1" }];
      }
      return [];
    }, 10);
    expect(keys).toEqual(["covers/event/kept.webp"]);

    const paged = await collectStorageObjectKeys(async (_prefix, offset) => {
      if (offset === 0) return [{ name: "a.webp", id: "1" }];
      if (offset === 1) return [{ name: "b.webp", id: "2" }];
      return [];
    }, 1);
    expect(paged).toEqual(["a.webp", "b.webp"]);

    const live = new Set(["a.webp"]);
    expect(planUnreferencedObjectDeletions(paged, live)).toEqual(["b.webp"]);
  });

  it("deletes only eevents-image- directories older than 15 minutes", async () => {
    const now = new Date("2026-10-02T12:00:00.000Z");
    expect(
      isStaleEventImageTempDirectory(
        "eevents-image-old",
        now.getTime() - STALE_EVENT_IMAGE_TEMP_MS,
        now.getTime(),
      ),
    ).toBe(false);
    expect(
      isStaleEventImageTempDirectory(
        "eevents-image-old",
        now.getTime() - STALE_EVENT_IMAGE_TEMP_MS - 1,
        now.getTime(),
      ),
    ).toBe(true);
    expect(isStaleEventImageTempDirectory("../eevents-image-old", 0, now.getTime())).toBe(false);

    const root = await mkdtemp(join(tmpdir(), "eevents-reconcile-"));
    const staleName = "eevents-image-stale";
    const freshName = "eevents-image-fresh";
    const exactName = "eevents-image-exact";
    const otherName = "other-temp";
    await mkdir(join(root, staleName));
    await mkdir(join(root, freshName));
    await mkdir(join(root, exactName));
    await mkdir(join(root, otherName));
    const staleTime = new Date(now.getTime() - 16 * 60 * 1000);
    const freshTime = new Date(now.getTime() - 5 * 60 * 1000);
    const exactTime = new Date(now.getTime() - STALE_EVENT_IMAGE_TEMP_MS);
    await utimes(join(root, staleName), staleTime, staleTime);
    await utimes(join(root, freshName), freshTime, freshTime);
    await utimes(join(root, exactName), exactTime, exactTime);
    await utimes(join(root, otherName), staleTime, staleTime);

    try {
      const dryRun = await reconcileEventImageTempDirectories({ root, now, apply: false });
      expect(dryRun.stale).toEqual([staleName]);
      expect(dryRun.deleted).toEqual([]);
      expect(dryRun.kept.sort()).toEqual([exactName, freshName].sort());
      expect((await stat(join(root, staleName))).isDirectory()).toBe(true);

      const applied = await reconcileEventImageTempDirectories({ root, now, apply: true });
      expect(applied.deleted).toEqual([staleName]);
      await expect(stat(join(root, staleName))).rejects.toThrow();
      expect((await stat(join(root, freshName))).isDirectory()).toBe(true);
      expect((await stat(join(root, exactName))).isDirectory()).toBe(true);
      expect((await stat(join(root, otherName))).isDirectory()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the certificate bucket script and sets the server action body limit", () => {
    const certificates = readFileSync("supabase/setup-storage.sql", "utf8");
    const media = readFileSync("supabase/setup-event-media.sql", "utf8");
    expect(certificates).toContain("'certificates'");
    expect(certificates).not.toContain("event-media");
    expect(media).toContain("'event-media'");
    expect(media).toContain("1048576");
    expect(media).toContain("image/webp");
    expect(media).toContain("false");
    expect(media).not.toMatch(/VALUES\s*\(\s*'certificates'/);
    expect(nextConfig.experimental?.serverActions).toMatchObject({ bodySizeLimit: "3mb" });
  });
});
