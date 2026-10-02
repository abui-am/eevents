/** Prisma 6 must disable prepared statements on Supabase's transaction pooler. */
export function runtimeDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  const supabasePooler = url.hostname.endsWith(".pooler.supabase.com") ||
    url.hostname.endsWith(".pooler.supabase.co");
  if (supabasePooler && url.port === "6543" &&
      (url.protocol === "postgresql:" || url.protocol === "postgres:")) {
    url.searchParams.set("pgbouncer", "true");
    return url.toString();
  }
  return value;
}
