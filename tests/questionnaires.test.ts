import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import { answerSchema, blankAnswers, decodeAnswerFilters, prefillAnswers, questionnaireSchema, readQuestions, type Question } from "@/lib/questionnaire";
import { saveQuestionnaire, getQuestionnaireEditor, getFilterQuestions, getAnswerReview } from "@/services/questionnaire-service";
import { applyToEvent, cancelOwnRegistration } from "@/services/registration-service";
import { getAdminEventParticipants, setAdminRegistrationStatus } from "@/services/admin-event-service";
import { submitQuestionnaireAction, saveQuestionnaireAction } from "@app/actions/questionnaires";
import QuestionsPage from "@app/admin/events/[id]/questions/page";
import MyAnswersPage from "@app/my/registrations/[id]/answers/page";
import AdminAnswersPage from "@app/admin/events/[id]/registrations/[registrationId]/answers/page";
import { safeLoginReturnPath } from "@/lib/redirects";
import { searchHref } from "@app/admin/admin-utils";
import { createTestEvent, createTestUser, createTestSession } from "./support/database";
import { setTestCookieToken } from "./support/next-mocks";

function question(type: Question["type"] = "SHORT_TEXT", required = false): Question {
  return { id: randomUUID(), type, required, label: "Experience", helperText: "Tell us about yourself.", options: type.includes("CHOICE") ? [{ id: randomUUID(), label: "Beginner" }, { id: randomUUID(), label: "Experienced" }] : [] };
}

async function fixture(questions = [question()]) {
  const admin = await createTestUser({ role: "ADMIN" });
  const participant = await createTestUser();
  const event = await createTestEvent(admin.id);
  const saved = await saveQuestionnaire(admin.id, event.id, 0, questions, true);
  const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  return { admin, participant, event: updated, questions, saved, versionId: updated.currentQuestionnaireVersionId };
}

it("validates question types, option uniqueness, identity uniqueness, and limits", () => {
  const choice = question("SINGLE_CHOICE");
  expect(questionnaireSchema.safeParse({ questions: [choice] }).success).toBe(true);
  expect(questionnaireSchema.safeParse({ questions: [{ ...choice, options: [choice.options[0]] }] }).success).toBe(false);
  expect(questionnaireSchema.safeParse({ questions: [{ ...choice, options: [{ ...choice.options[0], label: "Beginner" }, { ...choice.options[1], label: " beginner " }] }] }).success).toBe(false);
  expect(questionnaireSchema.safeParse({ questions: [choice, choice] }).success).toBe(false);
  expect(questionnaireSchema.safeParse({ questions: Array.from({ length: 21 }, () => question()) }).success).toBe(false);
  expect(questionnaireSchema.safeParse({ questions: [{ ...question(), label: "x".repeat(201) }] }).success).toBe(false);
});

it("saves drafts without exposing them to applicants and publishes immutable snapshots", async () => {
  const { admin, event, questions, saved } = await fixture();
  const changed = [{ ...questions[0], label: "Your experience" }];
  const draft = await saveQuestionnaire(admin.id, event.id, saved.revision, changed, false);
  expect((await getQuestionnaireEditor(event.id))?.unpublished).toBe(true);
  expect((await db.questionnaireVersion.findFirstOrThrow({ where: { eventId: event.id } })).questions).toEqual(questions);
  await saveQuestionnaire(admin.id, event.id, draft.revision, changed, true);
  const versions = await db.questionnaireVersion.findMany({ where: { eventId: event.id }, orderBy: { number: "asc" } });
  expect(versions.map((version) => version.questions)).toEqual([questions, changed]);
  expect((await getQuestionnaireEditor(event.id))?.unpublished).toBe(false);
});

it("rejects non-admin writes, closed event writes, and type changes under an existing identity", async () => {
  const { admin, participant, event, questions, saved } = await fixture();
  await expect(saveQuestionnaire(participant.id, event.id, saved.revision, [], true)).rejects.toMatchObject({ code: "forbidden" });
  await expect(saveQuestionnaire(admin.id, event.id, saved.revision, [{ ...questions[0], type: "YES_NO" }], true)).rejects.toMatchObject({ code: "invalid" });
  await db.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() - 1000) } });
  await expect(saveQuestionnaire(admin.id, event.id, saved.revision, [], true)).rejects.toMatchObject({ code: "locked" });
});

it("allows only one concurrent save or publication from the same revision", async () => {
  const { admin, event, questions, saved } = await fixture();
  const outcomes = await Promise.allSettled([
    saveQuestionnaire(admin.id, event.id, saved.revision, [{ ...questions[0], label: "First edit" }], true),
    saveQuestionnaire(admin.id, event.id, saved.revision, [{ ...questions[0], label: "Second edit" }], true),
  ]);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(await db.questionnaireVersion.count({ where: { eventId: event.id } })).toBe(2);
  await expect(saveQuestionnaire(admin.id, event.id, saved.revision, questions, false)).rejects.toMatchObject({ code: "conflict" });
});

it("validates and atomically stores every answer type including a false boolean", async () => {
  const questions = [question("SHORT_TEXT", true), question("LONG_TEXT"), question("SINGLE_CHOICE", true), question("MULTIPLE_CHOICE"), question("YES_NO", true)];
  const { participant, event, versionId } = await fixture(questions);
  const answers = { [questions[0].id]: "  New to coding  ", [questions[1].id]: "I want to learn.", [questions[2].id]: questions[2].options[0].id, [questions[3].id]: questions[3].options.map((option) => option.id), [questions[4].id]: "no" };
  expect(await applyToEvent(participant.id, event.slug, { versionId, answers })).toBe("applied");
  const registration = await db.registration.findFirstOrThrow({ where: { eventId: event.id }, include: { answers: true } });
  expect(registration.questionnaireVersionId).toBe(versionId);
  expect(registration.answers).toHaveLength(5);
  expect(registration.answers.find((answer) => answer.questionId === questions[0].id)?.textValue).toBe("New to coding");
  expect(registration.answers.find((answer) => answer.questionId === questions[4].id)?.booleanValue).toBe(false);
  expect(prefillAnswers(questions, registration.answers)).toEqual({ ...answers, [questions[0].id]: "New to coding" });
});

it("rejects missing/oversize/foreign answers and stale versions without reserving seats", async () => {
  const q = question("SINGLE_CHOICE", true);
  const { admin, participant, event, versionId, saved } = await fixture([q]);
  await expect(applyToEvent(participant.id, event.slug)).rejects.toMatchObject({ code: "required" });
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: "" } })).rejects.toMatchObject({ code: "invalid" });
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: randomUUID() } })).rejects.toMatchObject({ code: "invalid" });
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: q.options[0].id, [randomUUID()]: "injected" } })).rejects.toMatchObject({ code: "invalid" });
  await saveQuestionnaire(admin.id, event.id, saved.revision, [q], true);
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: q.options[0].id } })).rejects.toMatchObject({ code: "changed" });
  expect(await db.registration.count({ where: { eventId: event.id } })).toBe(0);
  expect(await db.registrationAnswer.count()).toBe(0);
  expect(answerSchema([question("SHORT_TEXT")]).safeParse({}).success).toBe(false);
  const text = question("SHORT_TEXT");
  expect(answerSchema([text]).safeParse({ [text.id]: "x".repeat(201) }).success).toBe(false);
});

it("allows only one applicant to reserve the last seat while storing answers", async () => {
  const { participant, event, versionId, questions } = await fixture([question("SHORT_TEXT", true)]);
  await db.event.update({ where: { id: event.id }, data: { capacity: 1 } });
  const second = await createTestUser();
  const outcomes = await Promise.all([participant, second].map((user) => applyToEvent(user.id, event.slug, { versionId, answers: { [questions[0].id]: "Ready" } })));
  expect(outcomes.filter((result) => result === "applied")).toHaveLength(1);
  expect(await db.registrationAnswer.count()).toBe(1);
});

it("retains cancelled answers, replaces them on reapplication, and preserves them on admin reopening", async () => {
  const { admin, participant, event, versionId, questions, saved } = await fixture();
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [questions[0].id]: "Original" } });
  const registration = await db.registration.findFirstOrThrow({ where: { eventId: event.id }, include: { answers: true } });
  await cancelOwnRegistration(participant.id, registration.id);
  expect(await db.registrationAnswer.count({ where: { registrationId: registration.id } })).toBe(1);
  const added = question("YES_NO", true);
  await saveQuestionnaire(admin.id, event.id, saved.revision, [...questions, added], true);
  const updated = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  await expect(applyToEvent(participant.id, event.slug, { versionId: updated.currentQuestionnaireVersionId, answers: { [questions[0].id]: "Changed", [added.id]: "" } })).rejects.toMatchObject({ code: "invalid" });
  expect((await db.registrationAnswer.findFirstOrThrow()).textValue).toBe("Original");
  await applyToEvent(participant.id, event.slug, { versionId: updated.currentQuestionnaireVersionId, answers: { [questions[0].id]: "Changed", [added.id]: "yes" } });
  await setAdminRegistrationStatus({ eventId: event.id, registrationId: registration.id, nextStatus: "CANCELLED" });
  await setAdminRegistrationStatus({ eventId: event.id, registrationId: registration.id, nextStatus: "REGISTERED" });
  const reopened = await db.registration.findUniqueOrThrow({ where: { id: registration.id }, include: { answers: true } });
  expect(reopened.questionnaireVersionId).toBe(updated.currentQuestionnaireVersionId);
  expect(reopened.answers).toHaveLength(2);
});

it("filters unchanged identities across versions and preserves historical options/wording", async () => {
  const q = question("SINGLE_CHOICE");
  const { admin, participant, event, versionId, saved } = await fixture([q]);
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: q.options[0].id } });
  const replacement = { id: randomUUID(), label: "Intermediate" };
  await saveQuestionnaire(admin.id, event.id, saved.revision, [{ ...q, label: "Your experience", options: [q.options[1], replacement] }], true);
  const next = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  const second = await createTestUser();
  await applyToEvent(second.id, event.slug, { versionId: next.currentQuestionnaireVersionId, answers: { [q.id]: replacement.id } });
  const catalog = await getFilterQuestions(event.id);
  expect(catalog[0].historicalOptionIds).toContain(q.options[0].id);
  const filtered = await getAdminEventParticipants(event.id, { page: 1, answerFilters: [{ questionId: q.id, operator: "any", optionIds: [q.options[0].id, replacement.id] }] });
  expect(filtered?.total).toBe(2);
  const review = await getAnswerReview(filtered!.registrations.find((item) => item.participant.email === participant.email)!.id, admin, event.id);
  expect(readQuestions(review?.questionnaireVersion?.questions)[0].label).toBe(q.label);
});

it("combines question filters with status/search/arrival before counts and pagination", async () => {
  const choice = question("MULTIPLE_CHOICE"), yesNo = question("YES_NO");
  const { participant, event, versionId } = await fixture([choice, yesNo]);
  for (let index = 0; index < 22; index++) {
    const user = index === 0 ? participant : await createTestUser({ name: `Matching ${index}` });
    await applyToEvent(user.id, event.slug, { versionId, answers: { [choice.id]: [choice.options[0].id], [yesNo.id]: index === 21 ? "no" : "yes" } });
    // Increase capacity as the fixture fills up; status and arrival are independent.
    await db.event.update({ where: { id: event.id }, data: { capacity: 30 } });
  }
  const answerFilters = [{ questionId: choice.id, operator: "any" as const, optionIds: [choice.options[0].id] }, { questionId: yesNo.id, operator: "yes" as const }];
  const result = await getAdminEventParticipants(event.id, { page: 2, answerFilters });
  expect(result?.total).toBe(21);
  expect(result?.registrations).toHaveLength(1);
  expect(result?.statusCounts.REGISTERED).toBe(21);
  const searched = await getAdminEventParticipants(event.id, { page: 1, query: participant.email, status: "CONFIRMED", arrival: "not-checked-in", answerFilters });
  expect(searched?.total).toBe(0);
  expect(searched?.statusCounts.REGISTERED).toBe(1);
  expect(searched?.activeRegistrationCount).toBe(22);
});

it("distinguishes missing answers from No, including legacy registrations", async () => {
  const q = question("YES_NO");
  const { participant, event, versionId } = await fixture([q]);
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [q.id]: "no" } });
  await db.registration.create({ data: { userId: (await createTestUser()).id, eventId: event.id } });
  const optional = await createTestUser();
  await applyToEvent(optional.id, event.slug, { versionId, answers: blankAnswers([q]) });
  const no = await getAdminEventParticipants(event.id, { page: 1, answerFilters: [{ questionId: q.id, operator: "no" }] });
  const missing = await getAdminEventParticipants(event.id, { page: 1, answerFilters: [{ questionId: q.id, operator: "unanswered" }] });
  expect(no?.total).toBe(1);
  expect(missing?.total).toBe(2);
});

it("uses literal case-insensitive text matching rather than SQL wildcards", async () => {
  const { participant, event, versionId, questions } = await fixture();
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [questions[0].id]: "100% Ready_A" } });
  const second = await createTestUser();
  await applyToEvent(second.id, event.slug, { versionId, answers: { [questions[0].id]: "100x ReadyBA" } });
  const result = await getAdminEventParticipants(event.id, { page: 1, answerFilters: [{ questionId: questions[0].id, operator: "contains", value: "% ready_" }] });
  expect(result?.total).toBe(1);
  expect(result?.registrations[0].participant.email).toBe(participant.email);
});

it("rejects malformed, cross-event, wrong-type and invalid-option filters", async () => {
  const { event, questions } = await fixture();
  expect(() => decodeAnswerFilters("{bad")).toThrow();
  expect(() => decodeAnswerFilters(JSON.stringify([{ questionId: "bad", operator: "answered" }]))).toThrow();
  for (const filter of [{ questionId: randomUUID(), operator: "answered" as const }, { questionId: questions[0].id, operator: "yes" as const }, { questionId: questions[0].id, operator: "any" as const, optionIds: [randomUUID()] }]) {
    await expect(getAdminEventParticipants(event.id, { page: 1, answerFilters: [filter] })).rejects.toMatchObject({ code: "invalid" });
  }
});

it("supports an empty publication while retaining previous responses and historical filters", async () => {
  const { admin, participant, event, versionId, questions, saved } = await fixture();
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [questions[0].id]: "History" } });
  await saveQuestionnaire(admin.id, event.id, saved.revision, [], true);
  expect((await getFilterQuestions(event.id))[0].historical).toBe(true);
  expect(await applyToEvent((await createTestUser()).id, event.slug)).toBe("applied");
  expect(await db.registrationAnswer.count()).toBe(1);
});

it("protects editor and answer-review pages with ADMIN/owner/event boundaries", async () => {
  const { admin, participant, event, versionId, questions } = await fixture();
  await applyToEvent(participant.id, event.slug, { versionId, answers: { [questions[0].id]: "Private" } });
  const registration = await db.registration.findFirstOrThrow({ where: { eventId: event.id } });
  const other = await createTestUser();
  expect(await getAnswerReview(registration.id, other)).toBeNull();
  expect(await getAnswerReview(registration.id, admin, "different-event")).toBeNull();
  await createTestSession(other.id);
  await expect(QuestionsPage({ params: Promise.resolve({ id: event.id }) })).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await expect(MyAnswersPage({ params: Promise.resolve({ id: registration.id }) })).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  await createTestSession(admin.id);
  await expect(AdminAnswersPage({ params: Promise.resolve({ id: "different-event", registrationId: registration.id }) })).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
  setTestCookieToken(null);
  await expect(QuestionsPage({ params: Promise.resolve({ id: event.id }) })).rejects.toMatchObject({ destination: "/login" });
});

it("returns structured errors and compatible values after a questionnaire changes", async () => {
  const { admin, participant, event, versionId, questions, saved } = await fixture();
  await createTestSession(participant.id);
  const data = new FormData(); data.set("versionId", versionId!); data.set("answers", JSON.stringify({ [questions[0].id]: "Keep this answer" }));
  const added = question("YES_NO", true);
  await saveQuestionnaire(admin.id, event.id, saved.revision, [...questions, added], true);
  const result = await submitQuestionnaireAction(event.slug, {}, data);
  expect(result.changed).toBe(true);
  expect(result.values).toEqual({ [questions[0].id]: "Keep this answer", [added.id]: "" });
  expect(await db.registration.count({ where: { eventId: event.id } })).toBe(0);
  expect(await safeLoginReturnPath(`/events/${event.slug}/apply`)).toBe(`/events/${event.slug}/apply`);
  expect(await safeLoginReturnPath(`/events/${event.slug}/apply?next=https://evil.test`)).toBeNull();
});

it("authorizes server actions even when called directly", async () => {
  const { participant, event, questions } = await fixture();
  await createTestSession(participant.id);
  await expect(saveQuestionnaireAction(event.id, { revision: 0, questions }, new FormData())).rejects.toMatchObject({ code: "TEST_NOT_FOUND" });
});

it("returns inline server errors and redirects successful submissions without answer values", async () => {
  const { participant, event, versionId, questions } = await fixture([question("SHORT_TEXT", true)]);
  await createTestSession(participant.id);
  const data = new FormData(); data.set("versionId", versionId!); data.set("answers", "{}");
  expect(await submitQuestionnaireAction(event.slug, {}, data)).toMatchObject({ fieldErrors: { [questions[0].id]: "Answer this required question." } });
  data.set("answers", JSON.stringify({ [questions[0].id]: "My private goal" }));
  await expect(submitQuestionnaireAction(event.slug, {}, data)).rejects.toMatchObject({ destination: `/events/${event.slug}?registration=applied` });
  expect(await db.registrationAnswer.count()).toBe(1);
});

it("allows omitted optional fields and enforces long text and multiple-choice validation", async () => {
  const multiple = question("MULTIPLE_CHOICE"), long = question("LONG_TEXT");
  const { participant, event, versionId } = await fixture([multiple, long]);
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [long.id]: "x".repeat(2001) } })).rejects.toMatchObject({ code: "invalid" });
  await expect(applyToEvent(participant.id, event.slug, { versionId, answers: { [multiple.id]: [multiple.options[0].id, multiple.options[0].id] } })).rejects.toMatchObject({ code: "invalid" });
  expect(await applyToEvent(participant.id, event.slug, { versionId, answers: {} })).toBe("applied");
  expect(await db.registrationAnswer.count()).toBe(0);
});

it("keeps answer criteria through status, search and pagination navigation", () => {
  const filters = JSON.stringify([{ questionId: randomUUID(), operator: "yes" }]);
  const url = new URL(searchHref("/admin/events/example", { page: 2, status: "REGISTERED", arrival: "not-checked-in", query: "Ada", filters }), "https://example.test");
  expect(url.searchParams.get("filters")).toBe(filters);
  expect(url.searchParams.get("q")).toBe("Ada");
  expect(url.searchParams.get("page")).toBe("2");
});

it("enables RLS on all questionnaire and answer tables", async () => {
  const rows = await db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('QuestionnaireDraft', 'QuestionnaireVersion', 'RegistrationAnswer')`;
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.relrowsecurity)).toBe(true);
});
