import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import { MagnifyingGlass, X } from "@anlg/ui/components/icons";
import { Badge } from "@anlg/ui/components/ui/badge";
import { Button } from "@anlg/ui/components/ui/button";
import { floatingSurfaceClassName } from "@anlg/ui/components/ui/floating-content";
import { cn } from "@anlg/utils";

import {
  getAdditionalSpokenLanguages,
  getBaseLanguageCode,
  getBaseLanguageDisplayName,
} from "./language";

interface SpokenLanguagesViewProps {
  mainLanguage: string;
  value: string[];
  onChange: (value: string[]) => void;
  supportedLanguages: readonly string[];
}

export function SpokenLanguagesView({
  mainLanguage,
  value,
  onChange,
  supportedLanguages,
}: SpokenLanguagesViewProps) {
  const { i18n, t } = useLingui();
  const [languageSearchQuery, setLanguageSearchQuery] = useState("");
  const [languageInputFocused, setLanguageInputFocused] = useState(false);
  const [languageSelectedIndex, setLanguageSelectedIndex] = useState(-1);

  const supportedLanguageCodes = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];

    for (const langCode of supportedLanguages) {
      const baseCode = getBaseLanguageCode(langCode);
      if (seen.has(baseCode)) continue;
      seen.add(baseCode);
      codes.push(baseCode);
    }

    return codes;
  }, [supportedLanguages]);

  const mainLanguageCode = getBaseLanguageCode(mainLanguage);
  const selectedLanguageCodes = useMemo(
    () => getAdditionalSpokenLanguages(mainLanguage, value),
    [mainLanguage, value],
  );

  const filteredLanguages = useMemo(() => {
    if (!languageSearchQuery.trim()) {
      return [];
    }
    const query = languageSearchQuery.toLowerCase();
    return supportedLanguageCodes.filter((langCode) => {
      if (langCode === mainLanguageCode) return false;
      if (selectedLanguageCodes.includes(langCode)) return false;
      const langName = getBaseLanguageDisplayName(langCode, i18n.locale);
      return langName.toLowerCase().includes(query);
    });
  }, [
    i18n.locale,
    languageSearchQuery,
    mainLanguageCode,
    selectedLanguageCodes,
    supportedLanguageCodes,
  ]);

  const handleLanguageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === "Backspace" &&
      !languageSearchQuery &&
      selectedLanguageCodes.length > 0
    ) {
      e.preventDefault();
      onChange(selectedLanguageCodes.slice(0, -1));
      return;
    }

    if (!languageSearchQuery.trim() || filteredLanguages.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLanguageSelectedIndex((prev) =>
        prev < filteredLanguages.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setLanguageSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (
        languageSelectedIndex >= 0 &&
        languageSelectedIndex < filteredLanguages.length
      ) {
        const selectedCode = filteredLanguages[languageSelectedIndex];
        onChange([...selectedLanguageCodes, selectedCode]);
        setLanguageSearchQuery("");
        setLanguageSelectedIndex(-1);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLanguageInputFocused(false);
      setLanguageSearchQuery("");
    }
  };

  return (
    <div>
      <h3 className="text-ui font-medium">
        <Trans>Additional spoken languages</Trans>
      </h3>
      <p className="text-muted-foreground text-label mb-3">
        <Trans>
          Used for transcription and automatic summary language detection.
        </Trans>
      </p>
      <div className="relative">
        <div
          className={cn([
            "border-input bg-background focus-within:border-foreground flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1",
          ])}
          onClick={() =>
            document.getElementById("language-search-input")?.focus()
          }
        >
          {selectedLanguageCodes.map((code) => (
            <Badge key={code} className="gap-1 pe-1">
              {getBaseLanguageDisplayName(code, i18n.locale)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hover:text-foreground size-3.5 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selectedLanguageCodes.filter((c) => c !== code));
                }}
              >
                <X className="size-3" />
              </Button>
            </Badge>
          ))}
          {selectedLanguageCodes.length === 0 && (
            <MagnifyingGlass className="text-muted-foreground ms-1 size-3.5 shrink-0" />
          )}
          <input
            id="language-search-input"
            type="text"
            value={languageSearchQuery}
            onChange={(e) => {
              setLanguageSearchQuery(e.target.value);
              setLanguageSelectedIndex(-1);
            }}
            onKeyDown={handleLanguageKeyDown}
            onFocus={() => setLanguageInputFocused(true)}
            onBlur={() => setLanguageInputFocused(false)}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={languageInputFocused && !!languageSearchQuery.trim()}
            aria-controls="language-options"
            aria-activedescendant={
              languageSelectedIndex >= 0
                ? `language-option-${languageSelectedIndex}`
                : undefined
            }
            aria-label={t`Add spoken language`}
            placeholder={
              selectedLanguageCodes.length === 0 ? t`Add language` : ""
            }
            className="placeholder:text-tertiary-foreground text-body min-w-[120px] flex-1 bg-transparent px-1 focus:outline-hidden focus-visible:outline-none"
          />
        </div>

        {languageInputFocused && languageSearchQuery.trim() && (
          <div
            id="language-options"
            role="listbox"
            className={cn([
              floatingSurfaceClassName,
              "absolute start-0 end-0 top-full z-10 mt-1 flex max-h-60 w-full flex-col overflow-y-auto p-1",
            ])}
          >
            {filteredLanguages.length > 0 ? (
              filteredLanguages.map((langCode, index) => (
                <button
                  key={langCode}
                  id={`language-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={languageSelectedIndex === index}
                  onClick={() => {
                    onChange([...selectedLanguageCodes, langCode]);
                    setLanguageSearchQuery("");
                    setLanguageSelectedIndex(-1);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setLanguageSelectedIndex(index)}
                  className={cn([
                    "text-ui flex h-7 w-full shrink-0 items-center justify-between rounded-md px-2 text-start",
                    languageSelectedIndex === index
                      ? "bg-muted"
                      : "hover:bg-muted",
                  ])}
                >
                  <span className="truncate">
                    {getBaseLanguageDisplayName(langCode, i18n.locale)}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-muted-foreground text-ui px-2 py-1.5">
                <Trans>No matching languages found</Trans>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
