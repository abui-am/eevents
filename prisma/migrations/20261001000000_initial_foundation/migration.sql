-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationActor" AS ENUM ('PARTICIPANT', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(60) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(200),
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "cancelledBy" "CancellationActor",
    "ticketVersion" INTEGER NOT NULL DEFAULT 0,
    "checkedInAt" TIMESTAMPTZ(3),
    "checkedInById" TEXT,
    "certificateKey" VARCHAR(300),
    "certificateUploadedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "Event"("organizerId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Registration_eventId_status_idx" ON "Registration"("eventId", "status");

-- CreateIndex
CREATE INDEX "Registration_checkedInById_idx" ON "Registration"("checkedInById");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_userId_eventId_key" ON "Registration"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain invariants that Prisma's schema language does not currently express.
ALTER TABLE public."Event"
    ADD CONSTRAINT "Event_endsAt_after_startsAt_check"
        CHECK ("endsAt" > "startsAt"),
    ADD CONSTRAINT "Event_capacity_positive_check"
        CHECK ("capacity" > 0);

ALTER TABLE public."Registration"
    ADD CONSTRAINT "Registration_cancelled_actor_check"
        CHECK (("status" = 'CANCELLED') = ("cancelledBy" IS NOT NULL)),
    ADD CONSTRAINT "Registration_check_in_pair_check"
        CHECK (("checkedInAt" IS NULL) = ("checkedInById" IS NULL)),
    ADD CONSTRAINT "Registration_ticket_version_nonnegative_check"
        CHECK ("ticketVersion" >= 0),
    ADD CONSTRAINT "Registration_certificate_pair_check"
        CHECK (("certificateKey" IS NULL) = ("certificateUploadedAt" IS NULL));

-- The public Supabase Data API cannot access application rows. Prisma connects
-- server-side as the trusted database owner; no client-facing RLS policies exist.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Registration" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    api_role name;
BEGIN
    FOR api_role IN
        SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public."User", public."Session", public."Event", public."Registration" FROM %I',
            api_role
        );
    END LOOP;
END;
$$;
