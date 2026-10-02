import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CERTIFICATE_BUCKET = "certificates";
const CERTIFICATE_LINK_TTL_SECONDS = 60;

let storageClient: SupabaseClient | undefined;

/** One server-only service-role client for certificate and event-media storage. */
export function getServiceRoleStorageClient(): SupabaseClient {
  return getStorageClient();
}

function getStorageClient(): SupabaseClient {
  if (storageClient) return storageClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Certificate storage is not configured.");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Certificate storage requires HTTPS in production.");
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

  storageClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return storageClient;
}

export function getCertificateUploadEndpoint(
  eventId: string,
  registrationId: string,
): string | null {
  const configuredUrl = process.env.SUPABASE_URL;
  if (!configuredUrl) return null;

  try {
    const projectUrl = new URL(configuredUrl);
    if (
      (projectUrl.protocol !== "https:" && projectUrl.protocol !== "http:") ||
      projectUrl.username ||
      projectUrl.password ||
      projectUrl.search ||
      projectUrl.hash ||
      projectUrl.pathname !== "/" ||
      projectUrl.hostname === "your-project-ref.supabase.co"
    ) {
      return null;
    }

    const endpoint = new URL("/functions/v1/certificate-upload", projectUrl.origin);
    endpoint.searchParams.set("eventId", eventId);
    endpoint.searchParams.set("registrationId", registrationId);
    return endpoint.toString();
  } catch {
    return null;
  }
}

export async function createCertificateSignedUrl(
  objectKey: string,
  registrationId: string,
): Promise<string> {
  const { data, error } = await getServiceRoleStorageClient()
    .storage.from(CERTIFICATE_BUCKET)
    .createSignedUrl(
      objectKey,
      CERTIFICATE_LINK_TTL_SECONDS,
      { download: `participation-certificate-${registrationId}.pdf` },
    );

  if (error || !data?.signedUrl) {
    throw new Error("Certificate download link could not be created.");
  }
  return data.signedUrl;
}
