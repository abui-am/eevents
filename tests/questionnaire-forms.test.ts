// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationQuestionnaire } from "@/components/application-questionnaire";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { AnswerFilters } from "@/components/answer-filters";
import { blankAnswers, type Question } from "@/lib/questionnaire";
import type { ApplicationFormState } from "@/lib/questionnaire-submission";

afterEach(cleanup);

const text: Question = { id: "a65da71c-9875-4fcf-8827-5005b1781a57", label: "Your goals", helperText: "Tell us what you hope to learn.", type: "SHORT_TEXT", required: true, options: [] };
const choice: Question = { id: "7b338e9a-0e62-40ec-bb22-6ea5cb8825b0", label: "Topics", helperText: "", type: "MULTIPLE_CHOICE", required: false, options: [{ id: "7dc2fa0a-23d3-4f67-bcd5-f8de9dc30ddd", label: "Design" }, { id: "a5e2f287-6172-4895-a296-8e1353907a31", label: "Code" }] };
const yesNo: Question = { id: "17b8ca61-9714-472d-80e6-0513450e9069", label: "Need a certificate?", helperText: "", type: "YES_NO", required: false, options: [] };

it("announces required errors after blur/submission and focuses the first invalid answer", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async (): Promise<ApplicationFormState> => ({}));
  render(h(ApplicationQuestionnaire, { questions: [text], versionId: "version", defaults: blankAnswers([text]), action }));
  const input = screen.getByLabelText(/Your goals/);
  await user.click(input);
  expect(screen.queryByRole("alert")).toBeNull();
  await user.tab();
  expect((await screen.findByRole("alert")).textContent).toContain("required question");
  expect(input.getAttribute("aria-describedby")).toContain(`${text.id}-error`);
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  expect(document.activeElement).toBe(input);
  expect(action).not.toHaveBeenCalled();
});

it("submits checkbox arrays and No without duplicate submission and preserves server-rejected values", async () => {
  const user = userEvent.setup();
  let finish: ((value: ApplicationFormState) => void) | undefined;
  const action = vi.fn(async (_state: ApplicationFormState, data: FormData) => {
    const values = JSON.parse(String(data.get("answers")));
    expect(values[choice.id]).toEqual(choice.options.map((option) => option.id));
    expect(values[yesNo.id]).toBe("no");
    return await new Promise<ApplicationFormState>((resolve) => { finish = resolve; });
  });
  render(h(ApplicationQuestionnaire, { questions: [text, choice, yesNo], versionId: "version", defaults: blankAnswers([text, choice, yesNo]), action }));
  await user.type(screen.getByLabelText(/Your goals/), "Learn together");
  await user.click(screen.getByLabelText("Design")); await user.click(screen.getByLabelText("Code"));
  await user.click(screen.getByLabelText("No", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Submitting application…" }).hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Submitting application…" }));
  expect(action).toHaveBeenCalledOnce();
  const values = JSON.parse(String(action.mock.calls[0][1].get("answers")));
  await act(async () => { finish?.({ values, message: "All places are reserved." }); });
  expect(screen.getByLabelText<HTMLInputElement>(/Your goals/).value).toBe("Learn together");
  expect(screen.getByLabelText<HTMLInputElement>("No", { exact: true }).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Submit application" }).hasAttribute("disabled")).toBe(false);
});

it("shows updated questions and retains compatible values after a publication", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async (): Promise<ApplicationFormState> => ({ changed: true, message: "Questions changed. Review before submitting.", questionnaire: { versionId: "next", questions: [text, { ...yesNo, required: true }] }, values: { [text.id]: "Keep me", [yesNo.id]: "" } }));
  render(h(ApplicationQuestionnaire, { questions: [text], versionId: "first", defaults: { [text.id]: "Keep me" }, action }));
  await user.click(screen.getByRole("button", { name: "Submit application" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Questions changed");
  expect(screen.getByLabelText<HTMLInputElement>(/Your goals/).value).toBe("Keep me");
  expect(screen.getByRole("group", { name: /Need a certificate/ })).toBeTruthy();
  expect(action).toHaveBeenCalledOnce();
});

it("keeps unpublished editing explicit and sends publish intent with validated questions", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async (state, data: FormData) => ({ ...state, questions: JSON.parse(String(data.get("questions"))), revision: 2, saved: true, unpublished: false, versionNumber: 1, message: "Published" }));
  render(h(QuestionnaireEditor, { initial: { revision: 1, questions: [text], unpublished: true }, action, previewHref: "/preview", publishedNumber: null, locked: false }));
  expect(screen.getByText(/Unpublished changes/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Publish questions" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0][1].get("intent")).toBe("publish");
  expect(JSON.parse(String(action.mock.calls[0][1].get("questions")))[0].id).toBe(text.id);
});

it("validates choice filter criteria and labels historical options", async () => {
  const user = userEvent.setup();
  render(h(AnswerFilters, { questions: [{ ...choice, historical: false, historicalOptionIds: [choice.options[0].id] }], filters: [{ questionId: choice.id, operator: "any", optionIds: [] }], basePath: "/admin/events/example", query: "" }));
  expect(screen.getByLabelText("Design (historical)")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Choose at least one valid option");
});

it("preserves question identities, options, and edited values in the sortable editor", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async (state, data: FormData) => ({ ...state, questions: JSON.parse(String(data.get("questions"))), saved: true, revision: 2 }));
  render(h(QuestionnaireEditor, { initial: { revision: 1, questions: [text, choice] }, action, previewHref: "/preview", publishedNumber: null, locked: false }));
  const inputs = screen.getAllByLabelText<HTMLInputElement>("Question", { exact: true });
  await user.type(inputs[0], " today");
  expect(screen.getAllByLabelText<HTMLInputElement>("Question", { exact: true }).map((input) => input.value)).toEqual(["Your goals today", "Topics"]);
  expect(screen.getByRole("button", { name: "Reorder question 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reorder question 2" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  const saved: Question[] = JSON.parse(String(action.mock.calls[0][1].get("questions")));
  expect(saved[0]).toEqual({ ...text, label: "Your goals today" });
  expect(saved[1]).toEqual(choice);
});

it("disables question reordering for a locked editor", () => {
  render(h(QuestionnaireEditor, { initial: { revision: 1, questions: [text, choice] }, action: vi.fn(), previewHref: "/preview", publishedNumber: null, locked: true }));
  expect(screen.getByRole("button", { name: "Reorder question 1" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("combobox", { name: "Position of question 1" })).toBeNull();
});
