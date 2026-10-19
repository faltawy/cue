// Option list and keyboard behaviour adapted from Catamorphic's
// packages/registry/src/agent-question-panel (Apache-2.0, see NOTICE).
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Question } from "../../questions";
import { Button, cx, IconButton, Kbd } from "./primitives";

const RECOMMENDED = /\s*\(recommended\)\s*$/i;

export function optionLabel(label: string): { text: string; suggested: boolean } {
  return RECOMMENDED.test(label) ? { text: label.replace(RECOMMENDED, ""), suggested: true } : { text: label, suggested: false };
}

export function QuestionPanel({
  questions,
  onAnswer,
  onDismiss,
  compact = false,
}: {
  questions: Question[];
  onAnswer(answers: string[]): void;
  onDismiss(): void;
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const single = questions.length === 1 && !questions[0]?.multiSelect;
  const complete = picked.every((choices) => choices.length > 0);

  const submit = (answers: string[][]) => onAnswer(answers.map((choices) => choices.join(", ")));

  const choose = (questionIndex: number, label: string) => {
    if (single) {
      submit([[label]]);
      return;
    }
    setPicked((current) =>
      current.map((choices, index) => {
        if (index !== questionIndex) return choices;
        if (!questions[index]?.multiSelect) return [label];
        return choices.includes(label) ? choices.filter((choice) => choice !== label) : [...choices, label];
      }),
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const typing =
        (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) && target.value.length > 0;
      const digit = Number(event.key);
      const options = questions[0]?.options ?? [];
      if (single && !typing && !event.metaKey && !event.ctrlKey && digit >= 1 && digit <= options.length) {
        const option = options[digit - 1];
        if (option) {
          event.preventDefault();
          submit([[option.label]]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className={cx(
        "coach-enter mb-2 flex min-h-[5.5rem] flex-col rounded-lg border border-foreground/25 bg-surface",
        compact ? "max-h-[78vh]" : "max-h-[min(60vh,440px)]",
      )}
      role="dialog"
      aria-label="The coach has a question"
      data-testid="question-panel"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute top-1.5 right-1.5 z-10 rtl:right-auto rtl:left-1.5">
          <IconButton label="Skip" shortcut={["esc"]} tooltipSide="top" tooltipAlign="end" onClick={onDismiss} className="size-6">
            <X aria-hidden className="size-3.5" />
          </IconButton>
        </div>
        <div className="coach-scroll coach-fade-bottom flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pt-2.5 pb-4">
          {questions.length > 1 && (
            <p className="pe-7 text-[12px] font-medium text-muted-foreground">A few questions</p>
          )}
          {questions.map((question, questionIndex) => (
          <fieldset key={questionIndex} className="min-w-0">
            <legend dir="auto" className={cx("mb-2 text-[14px] font-medium", questionIndex === 0 && questions.length === 1 && "pe-7")}>
              {question.question}
            </legend>
            <div
              className="flex flex-col gap-1"
              role={question.multiSelect ? undefined : "radiogroup"}
              aria-label={question.multiSelect ? undefined : question.question}
            >
              {question.options.map((option, optionIndex) => {
                const selected = picked[questionIndex]?.includes(option.label) ?? false;
                const { text, suggested } = optionLabel(option.label);
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    data-option
                    role={single ? undefined : question.multiSelect ? "checkbox" : "radio"}
                    aria-checked={single ? undefined : selected}
                    onClick={() => choose(questionIndex, option.label)}
                    className={cx(
                      "flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-start transition-colors duration-100",
                      selected ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted",
                    )}
                  >
                    {single ? (
                      <Kbd keys={[String(optionIndex + 1)]} className="mt-[1px]" />
                    ) : (
                      <span
                        aria-hidden
                        className={cx(
                          "mt-[3px] grid size-3.5 shrink-0 place-items-center border",
                          question.multiSelect ? "rounded-[4px]" : "rounded-full",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {selected &&
                          (question.multiSelect ? (
                            <Check className="size-2.5" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-primary-foreground" />
                          ))}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-1.5">
                        <span dir="auto" className="coach-align-parent text-[13.5px] leading-[1.4]">
                          {text}
                        </span>
                        {suggested && <span className="text-[11.5px] text-muted-foreground">Suggested</span>}
                      </span>
                      {option.description && (
                        <span dir="auto" className="coach-align-parent mt-0.5 block text-[12px] text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          ))}
        </div>
      </div>
      {!single && (
        <div className="flex shrink-0 justify-end px-3 pt-1 pb-3">
          <Button tone="primary" disabled={!complete} onClick={() => submit(picked)}>
            Send answer
          </Button>
        </div>
      )}
    </div>
  );
}
