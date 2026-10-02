-- Additive event content. Existing rows keep location and description and
-- receive null artwork and venue values; no backfill is required.
ALTER TABLE "Event"
    ADD COLUMN "coverKey" VARCHAR(300),
    ADD COLUMN "venueName" VARCHAR(160),
    ADD COLUMN "venueAddress" VARCHAR(300),
    ADD COLUMN "mapUrl" VARCHAR(1000);

-- CreateTable
CREATE TABLE "EventHost" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "biography" VARCHAR(500),
    "publicEmail" VARCHAR(320),
    "avatarKey" VARCHAR(300),
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "EventHost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventHost_eventId_displayOrder_key" ON "EventHost"("eventId", "displayOrder");

-- AddForeignKey
ALTER TABLE "EventHost" ADD CONSTRAINT "EventHost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The public Supabase Data API cannot access application rows. Prisma connects
-- server-side as the trusted database owner; no client-facing RLS policies exist.
ALTER TABLE public."EventHost" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    api_role name;
BEGIN
    FOR api_role IN
        SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public."EventHost" FROM %I',
            api_role
        );
    END LOOP;
END;
$$;
