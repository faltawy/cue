import { describe, expect, test } from "bun:test";

import { answerInput, parseQuestions, QuestionBroker } from "./questions";
import { askUserPermission } from "./session";

const toolInput = {
  questions: [
    {
      question: "Which customer is this about?",
      header: "Customer",
      multiSelect: false,
      options: [
        { label: "Wafeq", description: "Bcc on email replies" },
        { label: "Rewaa", description: "" },
      ],
    },
  ],
};

function recordingBroker() {
  const log: string[] = [];
  const broker = new QuestionBroker({
    opened: (id, questions) => log.push(`opened ${id}: ${questions[0]?.question}`),
    closed: (id, answers) => log.push(`closed ${id}: ${answers === null ? "unanswered" : answers.join(", ")}`),
  });
  return { broker, log };
}

describe("parseQuestions", () => {
  test("keeps well-formed questions and fills a header", () => {
    expect(parseQuestions({ questions: [{ question: "Q?", options: [{ label: "A" }, { nope: 1 }] }, { header: "x" }] })).toEqual([
      { question: "Q?", header: "Question", multiSelect: false, options: [{ label: "A", description: "" }] },
    ]);
    expect(parseQuestions(toolInput)).toHaveLength(1);
  });
});

describe("asking the user", () => {
  test("the picked option reaches the tool as its answer", async () => {
    const { broker, log } = recordingBroker();
    const pending = askUserPermission((id, questions, signal) => broker.ask(id, questions, signal), toolInput, {
      toolUseID: "toolu_1",
      signal: new AbortController().signal,
    });
    expect(broker.open().map((open) => open.id)).toEqual(["toolu_1"]);
    expect(broker.answer("toolu_1", ["Wafeq"])).toBe(true);
    expect(await pending).toEqual({
      behavior: "allow",
      updatedInput: { ...toolInput, answers: { "Which customer is this about?": "Wafeq" } },
    });
    expect(log).toEqual(["opened toolu_1: Which customer is this about?", "closed toolu_1: Wafeq"]);
    expect(broker.answer("toolu_1", ["Rewaa"])).toBe(false);
  });

  test("dismissing tells the model it wasn't answered", async () => {
    const { broker } = recordingBroker();
    const pending = askUserPermission((id, questions, signal) => broker.ask(id, questions, signal), toolInput, {
      toolUseID: "toolu_2",
      signal: new AbortController().signal,
    });
    broker.dismiss("toolu_2");
    expect(await pending).toEqual({
      behavior: "deny",
      message: "The question was not answered: The user dismissed the question.",
    });
  });

  test("stopping the turn closes the open question", async () => {
    const { broker, log } = recordingBroker();
    const abort = new AbortController();
    const pending = askUserPermission((id, questions, signal) => broker.ask(id, questions, signal), toolInput, {
      toolUseID: "toolu_3",
      signal: abort.signal,
    });
    abort.abort();
    expect((await pending).behavior).toBe("deny");
    expect(broker.open()).toEqual([]);
    expect(log.at(-1)).toBe("closed toolu_3: unanswered");
  });

  test("without anyone to answer, the model is told to continue", async () => {
    expect(
      await askUserPermission(undefined, toolInput, { toolUseID: "t", signal: new AbortController().signal }),
    ).toEqual({ behavior: "deny", message: "Nobody can answer questions here; continue without asking." });
  });

  test("when some questions go unanswered, everything the user said still reaches the model", () => {
    const two = { questions: [...toolInput.questions, { question: "Which channel?", options: [] }] };
    expect(answerInput(two, ["Wafeq"])).toEqual({
      ...two,
      answers: { "Which customer is this about?": "Wafeq" },
      response: "Wafeq",
    });
    expect(answerInput(toolInput, ["Wafeq"])).not.toHaveProperty("response");
  });
});
