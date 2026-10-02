/**
 * Manual reconciliation for event images.
 *
 * `finally` cannot remove a temp directory if the Node process is killed.
 * This script is the operator procedure. It is not an admin button and it is
 * not a cron job.
 *
 *   pnpm exec tsx scripts/reconcile-event-media.ts
 *   pnpm exec tsx scripts/reconcile-event-media.ts --apply
 *
 * The default is a dry run. `--apply` deletes:
 * - directories directly under os.tmpdir() named eevents-image-* whose mtime
 *   is older than 15 minutes
 * - objects in the private event-media bucket that are not a current Event.coverKey
 *   or EventHost.avatarKey
 *
 * It refuses to delete a key that is still stored on an event or host. A check
 * runs again immediately before each object delete. If a swap commits and the
 * previous object delete fails, leave the new database key in place. The old
 * object is an orphan and this script may remove it on a later run. Do not point
 * the row back at a key whose bytes may already be gone.
 *
 * Environment, never printed by this script:
 * - DATABASE_URL for the application database
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, server-only, same values as the app
 *
 * Setup is supabase/setup-event-media.sql, not a Prisma migration. The
 * certificates bucket is a different script and is not listed or modified here.
 * Run the app on the Node.js runtime with Sharp, a writable temp directory, and
 * a proxy that accepts at least a 3 MB request body.
 */
import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EVENT_MEDIA_BUCKET,
  EVENT_MEDIA_LIST_PAGE_SIZE,
  assertDeletionsAreUnreferenced,
  collectReferencedKeys,
  collectStorageObjectKeys,
  planUnreferencedObjectDeletions,
  type StorageListEntry,
} from "../src/lib/event-media-contract";
import { reconcileEventImageTempDirectories } from "../src/services/event-media-reconciliation";

const HELP = `Usage: pnpm exec tsx scripts/reconcile-event-media.ts [--apply]

Dry run by default. --apply deletes eevents-image- directories older than 15
minutes and event-media objects that are not a current cover or avatar key.
Referenced keys are refused.`;

function parseArgs(args: readonly string[]): { apply: boolean } {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }
  const unknown = args.filter((arg) => arg !== "--apply");
  if (unknown.length > 0) {
    console.error("Unknown argument. Use --apply to delete, or no arguments for a dry run.");
    process.exit(1);
  }
  return { apply: args.includes("--apply") };
}

function serviceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Event media storage is not configured.");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Event media storage requires HTTPS in production.");
  }
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("SUPABASE_URL must be a project origin.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function referencedKeys(db: PrismaClient): Promise<Set<string>> {
  const [events, hosts] = await Promise.all([
    db.event.findMany({
      where: { coverKey: { not: null } },
      select: { coverKey: true },
    }),
    db.eventHost.findMany({
      where: { avatarKey: { not: null } },
      select: { avatarKey: true },
    }),
  ]);
  return collectReferencedKeys(
    events.map((event) => event.coverKey),
    hosts.map((host) => host.avatarKey),
  );
}

async function listObjectKeys(client: SupabaseClient): Promise<string[]> {
  return collectStorageObjectKeys(async (prefix, offset, limit) => {
    const { data, error } = await client.storage.from(EVENT_MEDIA_BUCKET).list(prefix, {
      limit,
      offset,
    });
    if (error) throw new Error("Event media list failed.");
    return (data ?? []).map(
      (entry): StorageListEntry => ({
        name: entry.name,
        id: entry.id,
      }),
    );
  }, EVENT_MEDIA_LIST_PAGE_SIZE);
}

async function deleteObject(client: SupabaseClient, objectKey: string): Promise<void> {
  const { error } = await client.storage.from(EVENT_MEDIA_BUCKET).remove([objectKey]);
  if (error) throw new Error("Event media delete failed.");
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  if (existsSync(".env")) config({ path: ".env" });
  const temps = await reconcileEventImageTempDirectories({
    root: tmpdir(),
    now: new Date(),
    apply,
  });

  const db = new PrismaClient();
  try {
    const client = serviceRoleClient();
    const listed = await listObjectKeys(client);
    const planned = planUnreferencedObjectDeletions(listed, await referencedKeys(db));
    console.log(
      JSON.stringify({
        apply,
        staleTempDirectories: temps.stale,
        deletedTempDirectories: temps.deleted,
        keptTempDirectories: temps.kept,
        unreferencedObjects: planned,
      }),
    );

    if (!apply) return;

    for (const objectKey of planned) {
      assertDeletionsAreUnreferenced([objectKey], await referencedKeys(db));
      await deleteObject(client, objectKey);
    }
  } finally {
    await db.$disconnect();
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Refusing to delete")) console.error(message);
    else console.error("Event media reconciliation failed.");
    process.exitCode = 1;
  });
}
