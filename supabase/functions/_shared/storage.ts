import { createClient } from "@supabase/supabase-js";

const CERTIFICATE_BUCKET = "certificates";

export async function replacePrivateCertificate(
  objectKey: string,
  bytes: Uint8Array,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Certificate storage is not configured.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await supabase.storage
    .from(CERTIFICATE_BUCKET)
    .upload(objectKey, bytes, {
      cacheControl: "0",
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw new Error("Certificate upload failed.");
}
