import emojiData, { type Emoji, type EmojiMartData } from "@emoji-mart/data";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { Check, MagnifyingGlass, X } from "@anlg/ui/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import {
  DEFAULT_TEMPLATE_ICON,
  TEMPLATE_ICONS,
  TemplateIconGlyph,
  normalizeTemplateIcon,
  type TemplateIcon,
} from "./template-icon";

import {
  TemplateIconKind,
  IconPickerSize,
  IconPickerTab,
} from "~/templates/enums";

const ICON_COLORS = [
  "#9ca3af",
  "#94a3b8",
  "#5b67d8",
  "#25b5c9",
  "#4ab883",
  "#f2bd00",
  "#ef923d",
  "#c99b92",
  "#f05257",
];

const EMOJI_CATEGORY_IDS = new Set([
  "people",
  "nature",
  "foods",
  "activity",
  "places",
  "objects",
  "symbols",
  "flags",
]);

const FREQUENT_EMOJI_IDS = [
  "ok_hand",
  "heart",
  "white_check_mark",
  "+1",
  "pray",
  "joy",
  "eyes",
  "slightly_smiling_face",
  "grinning",
  "smile",
  "thinking_face",
  "sweat_smile",
  "warning",
  "confused",
  "x",
  "raised_hands",
  "tada",
  "wink",
  "blush",
  "shrug",
  "wave",
  "question",
];

const RECENT_EMOJIS_KEY = "cue.template-picker.recent-emojis";
const data = emojiData as EmojiMartData;

type EmojiItem = {
  id: string;
  native: string;
  name: string;
  search: string;
};

function toEmojiItem(emoji: Emoji): EmojiItem | null {
  const native = emoji.skins[0]?.native;
  if (!native) {
    return null;
  }

  return {
    id: emoji.id,
    native,
    name: emoji.name,
    search: [emoji.id, emoji.name, ...emoji.keywords].join(" ").toLowerCase(),
  };
}

const EMOJI_ITEMS = Object.values(data.emojis).reduce<
  Record<string, EmojiItem>
>((items, emoji) => {
  const item = toEmojiItem(emoji);
  if (item) {
    items[emoji.id] = item;
  }
  return items;
}, {});

const EMOJI_CATEGORIES = data.categories.flatMap((category) => {
  if (!EMOJI_CATEGORY_IDS.has(category.id)) {
    return [];
  }

  return [
    {
      id: category.id,
      items: category.emojis.flatMap((id) =>
        EMOJI_ITEMS[id] ? [EMOJI_ITEMS[id]] : [],
      ),
    },
  ];
});

function loadRecentEmojiIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = JSON.parse(
      window.localStorage.getItem(RECENT_EMOJIS_KEY) ??
        window.localStorage.getItem("anarlog.template-picker.recent-emojis") ??
        "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useLingui();
  return (
    <div className="border-border flex h-12 items-center gap-2 border-b px-4">
      <MagnifyingGlass className="text-muted-foreground size-4 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="placeholder:text-tertiary-foreground text-body min-w-0 flex-1 bg-transparent outline-hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="hover:bg-accent rounded-sm p-1"
          aria-label={t`Clear search`}
        >
          <X className="text-muted-foreground size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function TemplateIconPicker({
  value,
  onChange,
  size = IconPickerSize.Default,
  label,
}: {
  value: TemplateIcon;
  onChange: (value: TemplateIcon) => void;
  size?: IconPickerSize;
  label?: string;
}) {
  const { t } = useLingui();
  const selected = normalizeTemplateIcon(value);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<IconPickerTab>(
    selected.type === TemplateIconKind.Emoji
      ? IconPickerTab.Emojis
      : IconPickerTab.Icons,
  );
  const [iconSearch, setIconSearch] = useState("");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [recentEmojiIds, setRecentEmojiIds] = useState(loadRecentEmojiIds);
  const [iconColor, setIconColor] = useState(
    selected.type === TemplateIconKind.Icon
      ? selected.color
      : DEFAULT_TEMPLATE_ICON.color,
  );
  const [lastIconValue, setLastIconValue] = useState(
    selected.type === TemplateIconKind.Icon
      ? selected.value
      : DEFAULT_TEMPLATE_ICON.value,
  );
  const emojiCategoryLabels: Record<string, string> = {
    people: t`Smileys & People`,
    nature: t`Animals & Nature`,
    foods: t`Food & Drink`,
    activity: t`Activity`,
    places: t`Travel & Places`,
    objects: t`Objects`,
    symbols: t`Symbols`,
    flags: t`Flags`,
  };

  const filteredIcons = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    return query
      ? TEMPLATE_ICONS.filter((icon) => icon.search.includes(query))
      : TEMPLATE_ICONS;
  }, [iconSearch]);
  const filteredEmojiCategories = useMemo(() => {
    const query = emojiSearch.trim().toLowerCase();
    if (!query) {
      return EMOJI_CATEGORIES;
    }

    return EMOJI_CATEGORIES.flatMap((category) => {
      const items = category.items.filter((emoji) =>
        emoji.search.includes(query),
      );
      return items.length > 0 ? [{ ...category, items }] : [];
    });
  }, [emojiSearch]);
  const frequentEmojis = useMemo(() => {
    const ids = [...new Set([...recentEmojiIds, ...FREQUENT_EMOJI_IDS])];
    return ids.flatMap((id) => (EMOJI_ITEMS[id] ? [EMOJI_ITEMS[id]] : []));
  }, [recentEmojiIds]);

  const selectIcon = (iconValue: string) => {
    setLastIconValue(iconValue);
    onChange({
      type: TemplateIconKind.Icon,
      value: iconValue,
      color: iconColor,
    });
    setOpen(false);
  };
  const selectColor = (color: string) => {
    setIconColor(color);
    onChange({ type: TemplateIconKind.Icon, value: lastIconValue, color });
  };
  const selectEmoji = (emoji: EmojiItem) => {
    const nextRecent = [
      emoji.id,
      ...recentEmojiIds.filter((id) => id !== emoji.id),
    ].slice(0, 24);
    setRecentEmojiIds(nextRecent);
    try {
      window.localStorage.setItem(
        RECENT_EMOJIS_KEY,
        JSON.stringify(nextRecent),
      );
    } catch {
      // Recent emoji history is optional in restricted webviews.
    }
    onChange({ type: TemplateIconKind.Emoji, value: emoji.native });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn([
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md transition-colors",
            size === IconPickerSize.Sm
              ? "hover:bg-accent size-7"
              : "border-border bg-muted/60 hover:bg-accent after:border-t-background size-9 border after:absolute after:end-0 after:top-0 after:size-0 after:border-s-[8px] after:border-t-[8px] after:border-s-transparent",
          ])}
          aria-label={label ?? t`Choose template icon`}
        >
          <TemplateIconGlyph
            icon={selected}
            className={
              selected.type === TemplateIconKind.Emoji
                ? size === IconPickerSize.Sm
                  ? "text-body"
                  : "text-lg"
                : size === IconPickerSize.Sm
                  ? "size-4"
                  : "size-[18px]"
            }
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[420px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
      >
        <div className="border-border flex h-12 items-end gap-6 border-b px-4">
          {Object.values(IconPickerTab).map((nextTab) => (
            <button
              key={nextTab}
              type="button"
              role="tab"
              aria-selected={tab === nextTab}
              onClick={() => setTab(nextTab)}
              className={cn([
                "text-body relative h-full pt-1 font-medium capitalize",
                tab === nextTab
                  ? "text-foreground after:bg-primary after:absolute after:start-0 after:end-0 after:bottom-0 after:h-0.5"
                  : "text-muted-foreground hover:text-foreground",
              ])}
            >
              {nextTab === IconPickerTab.Icons ? t`Icons` : t`Emojis`}
            </button>
          ))}
        </div>

        {tab === IconPickerTab.Icons ? (
          <div>
            <div className="border-border border-b px-4 py-3">
              <div className="flex items-center justify-between">
                {ICON_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="relative flex size-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setCustomColorOpen(false);
                      selectColor(color);
                    }}
                    aria-label={`Use ${color}`}
                  >
                    {iconColor.toLowerCase() === color.toLowerCase() ? (
                      <Check className="size-4 text-white" />
                    ) : null}
                  </button>
                ))}
                <div className="bg-border h-7 w-px" />
                <button
                  type="button"
                  className={cn([
                    "size-7 rounded-full bg-[conic-gradient(from_180deg,red,#ff0,#0f0,#0ff,#00f,#f0f,red)]",
                    customColorOpen && "ring-primary ring-2",
                  ])}
                  onClick={() => setCustomColorOpen((current) => !current)}
                  aria-label={t`Choose custom color`}
                />
              </div>

              {customColorOpen ? (
                <div className="mt-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="size-6 rounded-full"
                      style={{ backgroundColor: iconColor }}
                    />
                    <span className="text-muted-foreground text-label font-medium">
                      HEX
                    </span>
                    <HexColorInput
                      color={iconColor}
                      onChange={selectColor}
                      prefixed
                      className="text-body min-w-0 flex-1 bg-transparent uppercase outline-hidden"
                    />
                  </div>
                  <HexColorPicker
                    color={iconColor}
                    onChange={selectColor}
                    className="template-color-picker! h-36! w-full!"
                  />
                </div>
              ) : null}
            </div>

            <SearchField
              value={iconSearch}
              onChange={setIconSearch}
              placeholder={t`Search icons...`}
            />
            <div className="scroll-fade-y max-h-[360px] overflow-y-auto p-3">
              <div className="grid grid-cols-12 gap-1">
                {filteredIcons.map((icon) => (
                  <button
                    key={icon.value}
                    type="button"
                    onClick={() => selectIcon(icon.value)}
                    className={cn([
                      "hover:bg-accent flex size-7 items-center justify-center rounded-md transition-colors",
                      selected.type === TemplateIconKind.Icon &&
                        selected.value === icon.value &&
                        "bg-accent",
                    ])}
                    title={icon.search}
                    aria-label={icon.search}
                  >
                    <icon.component
                      className="size-[18px]"
                      style={{ color: iconColor }}
                    />
                  </button>
                ))}
              </div>
              {filteredIcons.length === 0 ? (
                <p className="text-muted-foreground text-body py-8 text-center">
                  {t`No icons found`}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <SearchField
              value={emojiSearch}
              onChange={setEmojiSearch}
              placeholder={t`Search emoji...`}
            />
            <div className="scroll-fade-y max-h-[480px] overflow-y-auto px-4 py-3">
              {!emojiSearch.trim() ? (
                <EmojiSection
                  title={t`Frequently used`}
                  emojis={frequentEmojis}
                  onSelect={selectEmoji}
                />
              ) : null}
              {filteredEmojiCategories.map((category) => (
                <EmojiSection
                  key={category.id}
                  title={emojiCategoryLabels[category.id] ?? category.id}
                  emojis={category.items}
                  onSelect={selectEmoji}
                />
              ))}
              {filteredEmojiCategories.length === 0 ? (
                <p className="text-muted-foreground text-body py-8 text-center">
                  {t`No emoji found`}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EmojiSection({
  title,
  emojis,
  onSelect,
}: {
  title: string;
  emojis: EmojiItem[];
  onSelect: (emoji: EmojiItem) => void;
}) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="text-muted-foreground text-body mb-1.5 font-medium">
        {title}
      </h3>
      <div className="grid grid-cols-12 gap-1">
        {emojis.map((emoji) => (
          <button
            key={emoji.id}
            type="button"
            onClick={() => onSelect(emoji)}
            className="hover:bg-accent flex size-7 items-center justify-center rounded-md text-lg transition-colors"
            title={emoji.name}
            aria-label={emoji.name}
          >
            {emoji.native}
          </button>
        ))}
      </div>
    </section>
  );
}
