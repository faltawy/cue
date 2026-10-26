import { Check, Globe, ListPlus, Mail } from "lucide-react";
import { useState } from "react";

import { BlockKind } from "../../blocks";
import { type ImageThumb } from "../../image-limits";
import { type Source, SourceKind } from "../../sources";
import { type ActionItemView, type BlockView } from "../state";
import {
  Button,
  cx,
  IconButton,
  Tone,
  TooltipAlign,
  TooltipSide,
} from "./primitives";

export type BlockActions = {
  checkItem(blockId: string, index: number, checked: boolean): void;
  addItemToNote(blockId: string, index: number): Promise<unknown>;
  undo(editId: string): void;
  reply(text: string): void;
  open(url: string): void;
};

export const ACTIONS_PREVIEW = 8;

export function ActionsBlock({
  block,
  canAdd,
  latestUndoable,
  actions,
}: {
  block: Extract<BlockView, { kind: BlockKind.Actions }>;
  canAdd: boolean;
  latestUndoable: string | null;
  actions: BlockActions;
}) {
  const [open, setOpen] = useState(false);
  const long = block.items.length > ACTIONS_PREVIEW + 1;
  const shown =
    long && !open ? block.items.slice(0, ACTIONS_PREVIEW) : block.items;
  const done = block.items.filter((item) => item.checked).length;
  return (
    <section
      className="coach-enter border-border mt-2.5 rounded-lg border px-3 pt-2.5 pb-2"
      aria-label="Action items"
      data-testid="actions-block"
    >
      <h3 className="text-muted-foreground mb-1 flex items-baseline gap-1.5 text-[12px] font-medium">
        Action items
        {done > 0 && (
          <bdi className="font-normal tabular-nums">
            {done} of {block.items.length} done
          </bdi>
        )}
      </h3>
      <ul className="flex flex-col">
        {shown.map((item, index) => (
          <ActionRow
            key={index}
            item={item}
            canAdd={canAdd}
            undoable={item.edit !== null && item.edit.id === latestUndoable}
            onCheck={(checked) => actions.checkItem(block.id, index, checked)}
            onAdd={() => actions.addItemToNote(block.id, index)}
            onUndo={actions.undo}
          />
        ))}
      </ul>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground mt-1 text-[12px] font-medium"
        >
          {open ? "Show less" : `Show all ${block.items.length}`}
        </button>
      )}
    </section>
  );
}

function ActionRow({
  item,
  canAdd,
  undoable,
  onCheck,
  onAdd,
  onUndo,
}: {
  item: ActionItemView;
  canAdd: boolean;
  undoable: boolean;
  onCheck(checked: boolean): void;
  onAdd(): Promise<unknown>;
  onUndo(editId: string): void;
}) {
  const [pending, setPending] = useState(false);
  const added = item.edit !== null && !item.edit.undone;
  const label = `${item.owner ? `${item.owner}: ` : ""}${item.text}`;
  return (
    <li
      className="group/item flex items-start gap-2.5 py-1"
      data-testid="action-item"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={label}
        onClick={() => onCheck(!item.checked)}
        className={cx(
          "mt-[3px] grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-100",
          item.checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-foreground/40",
        )}
      >
        {item.checked && <Check aria-hidden className="size-2.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          dir="auto"
          className={cx(
            "text-[13.5px] leading-[1.45] [overflow-wrap:anywhere]",
            item.checked &&
              "text-muted-foreground line-through decoration-muted-foreground/60",
          )}
        >
          {item.owner && <span className="font-medium">{item.owner}:</span>}{" "}
          {item.text}
          {item.due && (
            <>
              {" "}
              <span className="text-muted-foreground">
                ·{" "}
                {item.due}
              </span>
            </>
          )}
        </p>
        {added && (
          <p className="text-muted-foreground -mb-1 flex h-6 items-center gap-1 text-[11.5px]">
            <Check aria-hidden className="size-3 shrink-0" />
            In notes
            {undoable && item.edit && (
              <Button
                tone={Tone.Ghost}
                className="h-6 px-1.5"
                onClick={() => item.edit && onUndo(item.edit.id)}
              >
                Undo
              </Button>
            )}
          </p>
        )}
      </div>
      {!added && canAdd && (
        <IconButton
          label={pending ? "Adding to note…" : "Add to note"}
          tooltipSide={TooltipSide.Top}
          tooltipAlign={TooltipAlign.End}
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            setPending(true);
            void onAdd().finally(() => setPending(false));
          }}
          className="-my-0.5 size-6"
        >
          <ListPlus aria-hidden className="size-3.5" />
        </IconButton>
      )}
    </li>
  );
}

export function Replies({
  options,
  onReply,
}: {
  options: readonly string[];
  onReply(text: string): void;
}) {
  return (
    <div
      className="coach-enter mt-2.5 flex flex-wrap gap-1.5"
      role="group"
      aria-label="Follow-ups"
    >
      {options.map((option, index) => (
        <button
          key={index}
          type="button"
          dir="auto"
          title={option}
          onClick={() => onReply(option)}
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground max-w-full min-w-0 truncate rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-100"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function SourceChips({
  sources,
  onOpen,
}: {
  sources: readonly Source[];
  onOpen(url: string): void;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
      {sources.map((source) => {
        const Icon = source.kind === SourceKind.Email ? Mail : Globe;
        return (
          <li key={source.url} className="max-w-full min-w-0">
            <a
              href={source.url}
              title={source.title}
              onClick={(event) => {
                event.preventDefault();
                onOpen(source.url);
              }}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 max-w-[240px] min-w-0 items-center gap-1 rounded-full border px-2 text-[11.5px] transition-colors duration-100"
            >
              <Icon aria-hidden className="size-3 shrink-0" />
              <bdi dir="auto" className="min-w-0 truncate">
                {source.label}
              </bdi>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function ImageThumbs({
  images,
  className,
}: {
  images: readonly ImageThumb[];
  className?: string;
}) {
  return (
    <div
      className={cx("flex flex-wrap gap-1.5", className)}
      data-testid="sent-images"
    >
      {images.map((image, index) => (
        <img
          key={index}
          src={image.thumb}
          width={image.width}
          height={image.height}
          alt={`Attached image ${index + 1}`}
          className="border-border h-16 w-auto max-w-[160px] min-w-12 rounded-md border object-cover"
        />
      ))}
    </div>
  );
}
