export type QuestionOption = { label: string; description: string };

export type Question = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

export function parseQuestions(input: unknown): Question[] {
  const raw = asRecord(input)?.questions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): Question[] => {
    const question = asRecord(entry);
    if (typeof question?.question !== "string") return [];
    const options = Array.isArray(question.options)
      ? question.options.flatMap((option): QuestionOption[] => {
          const parsed = asRecord(option);
          return typeof parsed?.label === "string"
            ? [
                {
                  label: parsed.label,
                  description:
                    typeof parsed.description === "string"
                      ? parsed.description
                      : "",
                },
              ]
            : [];
        })
      : [];
    return [
      {
        question: question.question,
        header:
          typeof question.header === "string" && question.header.length > 0
            ? question.header
            : "Question",
        multiSelect: question.multiSelect === true,
        options,
      },
    ];
  });
}

export function answerInput(
  toolInput: Record<string, unknown>,
  answers: readonly string[],
): Record<string, unknown> {
  const texts = parseQuestions(toolInput).map((question) => question.question);
  const byQuestion: Record<string, string> = {};
  for (const [index, text] of texts.entries()) {
    const answer = answers[index]?.trim();
    if (answer) byQuestion[text] = answer;
  }
  const unmatched = Object.keys(byQuestion).length < texts.length;
  const response = answers.join("\n\n").trim();
  return {
    ...toolInput,
    answers: byQuestion,
    ...(unmatched && response ? { response } : {}),
  };
}

export type QuestionOutcome =
  | { answered: true; answers: string[] }
  | { answered: false; reason: string };

type Pending = {
  questions: Question[];
  settle: (outcome: QuestionOutcome) => void;
};

export type QuestionListener = {
  opened(id: string, questions: Question[]): void;
  closed(id: string, answers: string[] | null): void;
};

export class QuestionBroker {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly listener: QuestionListener) {}

  ask(
    id: string,
    questions: Question[],
    signal?: AbortSignal,
  ): Promise<QuestionOutcome> {
    return new Promise((resolve) => {
      const settle = (outcome: QuestionOutcome) => {
        if (!this.pending.delete(id)) return;
        signal?.removeEventListener("abort", onAbort);
        this.listener.closed(id, outcome.answered ? outcome.answers : null);
        resolve(outcome);
      };
      const onAbort = () =>
        settle({
          answered: false,
          reason: "The turn stopped before the question was answered.",
        });
      this.pending.set(id, { questions, settle });
      this.listener.opened(id, questions);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  answer(id: string, answers: string[]): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    pending.settle({ answered: true, answers });
    return true;
  }

  dismiss(id: string): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    pending.settle({
      answered: false,
      reason: "The user dismissed the question.",
    });
    return true;
  }

  dismissAll(reason: string) {
    for (const pending of [...this.pending.values()])
      pending.settle({ answered: false, reason });
  }

  open(): Array<{ id: string; questions: Question[] }> {
    return [...this.pending.entries()].map(([id, { questions }]) => ({
      id,
      questions,
    }));
  }
}
