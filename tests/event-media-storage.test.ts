import { afterAll, expect, it, vi } from "vitest";
import { EventMediaError } from "@/lib/event-media-error";
import {
  EVENT_MEDIA_BUCKET,
  MAX_OUTPUT_BYTES,
} from "@/lib/event-media-contract";
import {
  deleteEventMediaObject,
  downloadEventMediaObject,
  uploadEventMediaObject,
} from "@/lib/event-media-storage";

const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
const buckets = vi.hoisted(() => [] as string[]);
const createClient = vi.hoisted(() =>
  vi.fn(() => ({
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return { upload, remove, download };
      },
    },
  })),
);

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_ROLE_KEY = "service-role-test-key";
const OBJECT_KEY = "covers/event/11111111-1111-4111-8111-111111111111.webp";

afterAll(() => {
  if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
});

it("reuses one server-only service-role client and uploads WebP without upsert", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  upload.mockResolvedValue({ data: { path: OBJECT_KEY }, error: null });
  remove.mockResolvedValue({ data: [], error: null });

  await expect(uploadEventMediaObject(OBJECT_KEY, Buffer.from("webp"))).rejects.toMatchObject({
    code: "storage_unavailable",
  });
  expect(createClient).not.toHaveBeenCalled();

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  const body = Buffer.from("RIFFxxxxWEBP");
  await uploadEventMediaObject(OBJECT_KEY, body);
  await uploadEventMediaObject(OBJECT_KEY, body);

  expect(createClient).toHaveBeenCalledTimes(1);
  expect(createClient).toHaveBeenCalledWith(
    "https://project.supabase.co",
    SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  expect(buckets).toEqual([EVENT_MEDIA_BUCKET, EVENT_MEDIA_BUCKET]);
  expect(upload).toHaveBeenCalledWith(OBJECT_KEY, body, {
    contentType: "image/webp",
    upsert: false,
  });

  upload.mockResolvedValueOnce({
    data: null,
    error: { message: SERVICE_ROLE_KEY },
  });
  try {
    await uploadEventMediaObject(OBJECT_KEY, body);
    throw new Error("Expected the storage failure to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(EventMediaError);
    expect(error).toMatchObject({ code: "storage_unavailable" });
    expect(error instanceof Error ? error.message : "").not.toContain(SERVICE_ROLE_KEY);
  }

  await expect(
    uploadEventMediaObject(OBJECT_KEY, Buffer.alloc(MAX_OUTPUT_BYTES + 1)),
  ).rejects.toMatchObject({ code: "output_too_large" });
  await expect(deleteEventMediaObject("../certificates/secret.pdf")).rejects.toMatchObject({
    code: "invalid_input",
  });
  expect(remove).not.toHaveBeenCalled();

  await deleteEventMediaObject("covers/event/north.webp");
  expect(remove).toHaveBeenCalledWith(["covers/event/north.webp"]);

  const bytes = Buffer.from("RIFFxxxxWEBP");
  download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
  await expect(downloadEventMediaObject(OBJECT_KEY)).resolves.toEqual(bytes);
  expect(download).toHaveBeenCalledWith(OBJECT_KEY);
  expect(buckets.at(-1)).toBe(EVENT_MEDIA_BUCKET);

  download.mockResolvedValueOnce({
    data: null,
    error: { message: "Object not found", statusCode: "404" },
  });
  await expect(downloadEventMediaObject(OBJECT_KEY)).resolves.toBeNull();

  download.mockResolvedValueOnce({
    data: null,
    error: { message: SERVICE_ROLE_KEY, statusCode: "500" },
  });
  try {
    await downloadEventMediaObject(OBJECT_KEY);
    throw new Error("Expected the download failure to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(EventMediaError);
    expect(error).toMatchObject({ code: "storage_unavailable" });
    expect(error instanceof Error ? error.message : "").not.toContain(SERVICE_ROLE_KEY);
  }

  const downloadCalls = download.mock.calls.length;
  await expect(downloadEventMediaObject("../certificates/secret.webp")).rejects.toMatchObject({
    code: "invalid_input",
  });
  expect(download).toHaveBeenCalledTimes(downloadCalls);
});
