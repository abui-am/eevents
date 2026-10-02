CREATE TABLE "QuestionnaireDraft" (
  "eventId" TEXT PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "questions" JSONB NOT NULL CHECK (jsonb_typeof("questions") = 'array'),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "QuestionnaireDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "QuestionnaireVersion" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "questions" JSONB NOT NULL CHECK (jsonb_typeof("questions") = 'array'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuestionnaireVersion_eventId_number_key" ON "QuestionnaireVersion"("eventId", "number");
ALTER TABLE "Event" ADD COLUMN "currentQuestionnaireVersionId" TEXT;
ALTER TABLE "Event" ADD CONSTRAINT "Event_currentQuestionnaireVersionId_fkey" FOREIGN KEY ("currentQuestionnaireVersionId") REFERENCES "QuestionnaireVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Event_currentQuestionnaireVersionId_idx" ON "Event"("currentQuestionnaireVersionId");
ALTER TABLE "Registration" ADD COLUMN "questionnaireVersionId" TEXT;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "QuestionnaireVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Registration_questionnaireVersionId_idx" ON "Registration"("questionnaireVersionId");
CREATE TABLE "RegistrationAnswer" (
  "id" TEXT PRIMARY KEY,
  "registrationId" TEXT NOT NULL,
  "questionId" UUID NOT NULL,
  "textValue" VARCHAR(2000),
  "booleanValue" BOOLEAN,
  "optionIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  CONSTRAINT "RegistrationAnswer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegistrationAnswer_one_value" CHECK (
    num_nonnulls("textValue", "booleanValue") + CASE WHEN cardinality("optionIds") > 0 THEN 1 ELSE 0 END = 1
  ),
  CONSTRAINT "RegistrationAnswer_text_not_blank" CHECK ("textValue" IS NULL OR length(btrim("textValue")) > 0)
);
CREATE UNIQUE INDEX "RegistrationAnswer_registrationId_questionId_key" ON "RegistrationAnswer"("registrationId", "questionId");
CREATE INDEX "RegistrationAnswer_questionId_idx" ON "RegistrationAnswer"("questionId");
CREATE INDEX "RegistrationAnswer_optionIds_idx" ON "RegistrationAnswer" USING GIN("optionIds");

-- The custom-session application accesses these tables through trusted server
-- Prisma connections. Supabase API roles receive no policies or privileges.
ALTER TABLE "QuestionnaireDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionnaireVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationAnswer" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role name;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."QuestionnaireDraft", public."QuestionnaireVersion", public."RegistrationAnswer" FROM %I', api_role);
  END LOOP;
END;
$$;
