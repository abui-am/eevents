ALTER TABLE "Registration" ADD COLUMN "endPresenceAt" TIMESTAMPTZ(3), ADD COLUMN "endPresenceById" TEXT;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_endPresenceById_fkey" FOREIGN KEY ("endPresenceById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_end_presence_pair_check" CHECK (("endPresenceAt" IS NULL) = ("endPresenceById" IS NULL));
CREATE INDEX "Registration_endPresenceById_idx" ON "Registration"("endPresenceById");
CREATE TABLE "Certificate" (
  "id" TEXT PRIMARY KEY,
  "registrationId" TEXT NOT NULL,
  "token" VARCHAR(43) NOT NULL CHECK ("token" ~ '^[A-Za-z0-9_-]{43}$'),
  "html" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("templateVersion" > 0),
  "issuedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Certificate_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Certificate_registrationId_key" ON "Certificate"("registrationId");
CREATE UNIQUE INDEX "Certificate_token_key" ON "Certificate"("token");
-- Trusted Prisma reads serve token-scoped HTML; the Supabase Data API has no access.
ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role name;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."Certificate" FROM %I', api_role);
  END LOOP;
END;
$$;
-- Existing tickets stay valid. No attendance or certificate is inferred.
UPDATE "Registration" SET "checkInTicketVersion" = gen_random_uuid()
WHERE "checkInTicketVersion" IS NULL AND "status" IN ('REGISTERED', 'CONFIRMED', 'ATTENDED');
