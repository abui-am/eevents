-- Replace the temporary integer ticket counter with an unguessable UUID version.
-- Arrival fields and their paired nullability constraint are retained.
ALTER TABLE "Registration"
    DROP CONSTRAINT "Registration_ticket_version_nonnegative_check",
    DROP COLUMN "ticketVersion",
    ADD COLUMN "checkInTicketVersion" UUID;

CREATE UNIQUE INDEX "Registration_checkInTicketVersion_key"
    ON "Registration"("checkInTicketVersion");
