import "server-only";

import { EventMediaError } from "@/lib/event-media-error";
import {
  EVENT_MEDIA_BUCKET,
  EVENT_MEDIA_UPLOAD_OPTIONS,
  MAX_OUTPUT_BYTES,
  isDeletableObjectKey,
  isNewEventMediaObjectKey,
} from "@/lib/event-media-contract";
import { getServiceRoleStorageClient } from "@/lib/storage";

function client() {
  try {
    return getServiceRoleStorageClient();
  } catch {
    console.error("Event media storage is not configured.");
    throw new EventMediaError("storage_unavailable");
  }
}

export async function uploadEventMediaObject(
  objectKey: string,
  body: Buffer,
): Promise<void> {
  if (!isNewEventMediaObjectKey(objectKey)) {
    throw new EventMediaError("invalid_input");
  }
  if (body.byteLength < 1 || body.byteLength > MAX_OUTPUT_BYTES) {
    throw new EventMediaError("output_too_large");
  }

  const { error } = await client()
    .storage.from(EVENT_MEDIA_BUCKET)
    .upload(objectKey, body, EVENT_MEDIA_UPLOAD_OPTIONS);
  if (error) {
    console.error("Event media upload failed.");
    throw new EventMediaError("storage_unavailable");
  }
}

export async function deleteEventMediaObject(objectKey: string): Promise<void> {
  if (!isDeletableObjectKey(objectKey)) {
    throw new EventMediaError("invalid_input");
  }

  const { error } = await client().storage.from(EVENT_MEDIA_BUCKET).remove([objectKey]);
  if (error) {
    console.error("Event media delete failed.");
    throw new EventMediaError("cleanup_failed");
  }
}

function objectIsMissing(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === "404" || error.message.toLowerCase().includes("not found");
}

/** Downloads stored bytes. Returns null when the object is absent. Never signs a URL. */
export async function downloadEventMediaObject(objectKey: string): Promise<Buffer | null> {
  if (!isDeletableObjectKey(objectKey)) {
    throw new EventMediaError("invalid_input");
  }

  try {
    const { data, error } = await client()
      .storage.from(EVENT_MEDIA_BUCKET)
      .download(objectKey);
    if (error) {
      if (objectIsMissing(error)) return null;
      console.error("Event media download failed.");
      throw new EventMediaError("storage_unavailable");
    }
    if (!data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
  } catch (error) {
    if (error instanceof EventMediaError) throw error;
    console.error("Event media download failed.");
    throw new EventMediaError("storage_unavailable");
  }
}
