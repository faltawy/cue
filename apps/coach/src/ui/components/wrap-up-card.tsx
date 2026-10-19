import { Check, Copy, ListPlus, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";

import type { WrapUpView } from "../../protocol";
import { Button, cx } from "./primitives";

export type WrapUpActions = {
  copy(text: string): Promise<boolean>;
  addActionItems(): Promise<unknown>;
  logToClients(): Promise<unknown>;
  ask(text: string): void;
};

export function isEmptyWrapUp(view: WrapUpView | null): boolean {
  if (view?.state !== "ready") return false;
  const { wrapUp } = view;
  return wrapUp.commitments.length === 0 && wrapUp.open_questions.length === 0 && !hasFollowUp(wrapUp.follow_up_draft);
}

export function WrapUpCard({ view, actions, busy }: { view: WrapUpView; actions: WrapUpActions; busy: boolean }) {
  if (isEmptyWrapUp(view)) {
    return (
      <p className="coach-enter text-center text-[12.5px] text-muted-foreground" data-testid="wrap-up">
        Too short to wrap up.
      </p>
    );
  }
  return (
    <section
      className="coach-enter rounded-lg border border-border bg-surface px-3 pt-2.5 pb-3"
      aria-label="Meeting wrap-up"
      data-testid="wrap-up"
    >
      <h2 className="mb-2 text-[13px] font-semibold">Wrap-up</h2>
      <div>
        {view.state === "running" && <WrapUpSkeleton />}
        {view.state === "failed" && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">Couldn't write the wrap-up.</p>
            <Button tone="outline" disabled={busy} onClick={() => actions.ask("Summarize the meeting: commitments, open questions, and a short follow-up draft.")}>
              Try again
            </Button>
          </div>
        )}
        {view.state === "ready" && <WrapUpBody view={view} actions={actions} />}
      </div>
    </section>
  );
}

function WrapUpSkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Writing your wrap-up">
      <p className="coach-sheen text-[13px] font-medium">Writing…</p>
      <div className="coach-skeleton h-3 w-11/12" />
      <div className="coach-skeleton h-3 w-9/12" />
      <div className="coach-skeleton h-3 w-10/12" />
    </div>
  );
}

function useFlag(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), 1_500);
    return () => clearTimeout(timer);
  }, [on]);
  return [on, () => setOn(true)];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[12px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function WrapUpBody({ view, actions }: { view: Extract<WrapUpView, { state: "ready" }>; actions: WrapUpActions }) {
  const [copied, flagCopied] = useFlag();
  const { wrapUp } = view;
  const hasDraft = hasFollowUp(wrapUp.follow_up_draft);
  const canAdd = view.added || view.actions.addActionItems.enabled;
  const canLog = view.logged || view.actions.logToClients.enabled;
  const buttons = [hasDraft, canAdd, canLog].filter(Boolean).length;
  return (
    <div className="flex flex-col gap-3">
      {wrapUp.commitments.length > 0 && (
        <Section title="Commitments">
          <ul className="flex flex-col gap-1">
            {wrapUp.commitments.map((commitment, index) => (
              <li key={index} dir="auto" className="text-[13.5px] leading-[1.45]">
                <span className="font-medium">{commitment.who}:</span> {commitment.what}
                {commitment.when && <span className="text-muted-foreground"> · {commitment.when}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {wrapUp.open_questions.length > 0 && (
        <Section title="Open questions">
          <ul className="flex flex-col gap-1">
            {wrapUp.open_questions.map((question, index) => (
              <li key={index} dir="auto" className="flex gap-2 text-[13.5px] leading-[1.45]">
                <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0">{question}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {hasDraft && (
        <Section title="Follow-up draft">
          <Draft text={wrapUp.follow_up_draft} />
        </Section>
      )}
      {buttons > 0 && (
      <div className={cx("grid gap-1.5", buttons === 1 ? "grid-cols-[auto] justify-start" : "grid-cols-2")}>
        {hasDraft && (
          <Button
            tone="primary"
            wrap
            className={buttons === 3 ? "col-span-2" : undefined}
            onClick={() => void actions.copy(wrapUp.follow_up_draft).then((ok) => ok && flagCopied())}
          >
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
            {copied ? "Copied" : "Copy follow-up"}
          </Button>
        )}
        {canAdd && (
          <ActionButton
            done={view.added}
            label="Add as action items"
            doneLabel="Added as action items"
            icon={<ListPlus aria-hidden className="size-3.5" />}
            run={actions.addActionItems}
          />
        )}
        {canLog && (
          <ActionButton
            done={view.logged}
            label="Log promises to clients"
            doneLabel="Logged to clients"
            icon={<NotebookPen aria-hidden className="size-3.5" />}
            run={actions.logToClients}
          />
        )}
      </div>
      )}
    </div>
  );
}

export function hasFollowUp(draft: string): boolean {
  return draft.trim().length > 0;
}

const DRAFT_PREVIEW_LINES = 6;

function Draft({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > DRAFT_PREVIEW_LINES || text.length > 360;
  return (
    <div className="border-s-2 border-border ps-3">
      <p
        dir="auto"
        className={cx(
          "text-[13.5px] leading-[1.55] whitespace-pre-wrap",
          long && !open && "coach-fade-bottom max-h-[calc(1.55em*6)] overflow-hidden",
        )}
        data-testid="follow-up-draft"
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="mt-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

function ActionButton({
  done,
  label,
  doneLabel,
  icon,
  run,
}: {
  done: boolean;
  label: string;
  doneLabel: string;
  icon: React.ReactNode;
  run(): Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      tone="outline"
      wrap
      disabled={done || pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        void run().finally(() => setPending(false));
      }}
    >
      {done ? <Check aria-hidden className="size-3.5" /> : icon}
      {done ? doneLabel : pending ? `${label}…` : label}
    </Button>
  );
}
