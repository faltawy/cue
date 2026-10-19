import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@anlg/ui/components/ui/input-group";

const MAX_LIMIT_CENTS = 10_000;

export function formatLimit(cents: number) {
  return (cents / 100).toFixed(2);
}

export function parseLimit(text: string): number | null {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return cents >= 1 && cents <= MAX_LIMIT_CENTS ? cents : null;
}

export function SpendLimitInput({
  cents,
  disabled,
  onSave,
  labelProps,
}: {
  cents: number;
  disabled: boolean;
  onSave: (cents: number) => void;
  labelProps: {
    "aria-labelledby": string;
    "aria-describedby": string | undefined;
  };
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(formatLimit(cents));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(formatLimit(cents));
    setInvalid(false);
  }, [cents]);

  const commit = () => {
    const next = parseLimit(draft);
    setInvalid(next === null);
    if (next === null) return;
    setDraft(formatLimit(next));
    if (next !== cents) onSave(next);
  };

  return (
    <div className="flex w-full flex-col items-end gap-1">
      <InputGroup>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput
          {...labelProps}
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
      </InputGroup>
      {invalid && (
        <p role="alert" className="text-destructive text-label">
          {t`Enter an amount from $0.01 to $100.`}
        </p>
      )}
    </div>
  );
}
