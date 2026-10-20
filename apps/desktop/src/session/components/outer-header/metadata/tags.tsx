import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useMemo, useState } from "react";

import { X } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import {
  addSessionTag,
  removeSessionTag,
  sameTag,
  useSessionTagNames,
  useTagCounts,
} from "~/session/tags";

const MAX_SUGGESTIONS = 6;

export function SessionTagsEditor({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const listId = useId();
  const tags = useSessionTagNames(sessionId);
  const tagCounts = useTagCounts();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const query = draft.trim().replace(/^#/, "").trim();
  const options = useMemo(() => {
    const needle = query.toLocaleLowerCase();
    const existing = tagCounts
      .map((tag) => tag.name)
      .filter(
        (name) =>
          !tags.some((tag) => sameTag(tag, name)) &&
          name.toLocaleLowerCase().includes(needle),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((name) => ({ name, isNew: false }));
    const known =
      tags.some((tag) => sameTag(tag, query)) ||
      tagCounts.some((tag) => sameTag(tag.name, query));
    return query && !known
      ? [...existing, { name: query, isNew: true }]
      : existing;
  }, [query, tagCounts, tags]);

  const add = useMutation({
    mutationFn: (name: string) => addSessionTag(sessionId, name),
    onSuccess: () => {
      setDraft("");
      setHighlighted(0);
    },
  });
  const remove = useMutation({
    mutationFn: (name: string) => removeSessionTag(sessionId, name),
  });

  const commit = (name: string) => {
    if (tags.some((tag) => sameTag(tag, name))) {
      setDraft("");
      return;
    }
    add.mutate(name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && !draft) return;
    // Keep the surrounding menu from treating typing and arrows as navigation.
    event.stopPropagation();
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const option = options[highlighted] ?? options[0];
      if (option && (query || event.key === "Enter")) commit(option.name);
    } else if (event.key === "Escape") {
      setDraft("");
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      remove.mutate(tags[tags.length - 1]);
    }
  };

  const error = add.error ?? remove.error;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-label font-medium">
        <Trans>Tags</Trans>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="border-border text-muted-foreground text-label inline-flex h-6 max-w-full items-center gap-0.5 rounded-full border ps-2.5 pe-1"
          >
            <bdi className="truncate">#{tag}</bdi>
            <button
              type="button"
              aria-label={t`Remove tag ${tag}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(tag)}
              className="hover:bg-muted hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded-full"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-label={t`Add tag`}
          aria-expanded={focused && options.length > 0}
          aria-controls={listId}
          placeholder={t`Add tag`}
          value={draft}
          disabled={add.isPending}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlighted(0);
            add.reset();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          className="text-body placeholder:text-tertiary-foreground h-6 min-w-24 flex-1 bg-transparent outline-hidden"
        />
      </div>
      {focused && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t`Tag suggestions`}
          className="flex flex-col"
        >
          {options.map((option, index) => (
            <li
              key={`${option.isNew ? "new" : "tag"}-${option.name}`}
              role="option"
              aria-selected={index === highlighted}
              onPointerDown={(event) => {
                event.preventDefault();
                commit(option.name);
              }}
              onPointerEnter={() => setHighlighted(index)}
              className={cn([
                "text-ui flex h-7 cursor-pointer items-center gap-1 rounded-md px-2",
                index === highlighted && "bg-muted",
              ])}
            >
              {option.isNew ? (
                <span className="text-muted-foreground shrink-0">
                  <Trans>Create</Trans>
                </span>
              ) : null}
              <bdi className="truncate">#{option.name}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="text-destructive text-label">
          {String(error.message).includes("tag_name_too_long") ? (
            <Trans>Tags can be up to 64 characters.</Trans>
          ) : (
            <Trans>Could not update tags.</Trans>
          )}
        </p>
      ) : null}
    </div>
  );
}
