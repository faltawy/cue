# Cue audit: main app against `cue.md`

This snapshot was taken at `261046de`, after the Cue rename (3b46fa79) and icons (261046de). Line numbers refer to that commit. It is a read-only audit; nothing in the app has been changed.

Scope: `apps/desktop/src/**/*.{ts,tsx}` and `packages/ui/src/**`, excluding tests. A scanner (`(?<![\w/-])` token regexes over class strings) found the candidates, and each was then classified by hand: control or card, dot or button, floating layer or flat. Lines that are about the same element are grouped together.

## 0. Counts

| Category | To fix | Keep but verify | Notes |
|---|---|---|---|
| Radius (`rounded-*`) | 189 | 59 (`rounded-full` dots, avatars, chips, bars) | rounded-full 60, rounded-[arbitrary] 31, rounded-lg 29, rounded-xl 17, rounded-xs 14, rounded 11, rounded-2xl 11, rounded-<side>-xl 5 |
| Shadow | 64 | 4 | remove on controls/cards; `shadow-lg` popovers, `shadow-2xl` dialogs |
| Blur / backdrop | 16 | 0 | |
| Gradient | 24 | 0 | plus 6 icon SVG sources (§6) |
| Raw palette colour (incl. `white`/`black`, `neutral-*`, `#hex`) | 175 | 5 | |
| Type size off-scale (`text-[Npx]`, `text-base`, `text-lg`+) | 107 | 4 | `text-sm`/`text-xs` are on-scale aliases |
| Weight (`font-bold`, `font-light`) | 5 | 0 | |
| Physical direction (`pl/pr/ml/mr/left/right/text-left/border-l`) | 251 | 0 | §5 |
| Icon size or weight off-scale | 30 | 0 | §5 |

Total: 580 class-level fixes plus 251 logical-property renames, across 152 files.

The scanner can't see a `rounded-md` sitting on a card (it should be `rounded-lg`) when that card has no padding hint. These checks need to be done by eye in screenshots (§7). Every `focus-visible:ring-*` (182 focus utilities in total) is replaced by the one global outline in `cue.md` §6, so those are not listed line by line.

## 1. Tokens and global CSS (do first: everything else depends on it)

**`packages/design-system/src/tokens.css`** (all values from `cue.md` §2):
- `:root` L17 `--destructive: oklch(0.56 0.2 27)` → `oklch(0.53 0.2 27)`. `.dark` L68 `oklch(0.64 0.19 27)` → `oklch(0.68 0.19 27)`.
- `.dark` L69 `--destructive-foreground: oklch(0.98 0 0)` → `oklch(0.15 0 0)`.
- L28 and L79 `--warm-foreground: oklch(0.98 0 0)` → `oklch(0.2 0 0)` in both themes. White on amber is currently 2.1:1 and 2.6:1.
- L33 `--input: oklch(0.86 0 0)` → `oklch(0.62 0 0)`. L84 `oklch(0.36 0 0)` → `oklch(0.52 0 0)`. **Owner call:** this makes field borders visibly darker than the coach composer's hairline. The alternative is to keep the hairline and accept failing WCAG 1.4.11.
- L83 dark `--border: oklch(0.26 0 0)` → `oklch(0.28 0 0)` (coach).
- Add to `:root` / `.dark`:
  - `--tertiary-foreground: oklch(0.52 0 0)` / `oklch(0.62 0 0)`
  - `--warm-strong: oklch(0.6 0.13 65)` / `oklch(0.78 0.12 72)`
  - `--warm-glow: oklch(0.75 0.12 70 / 0.15)` / `oklch(0.7 0.12 70 / 0.15)`
  - `--live: oklch(0.62 0.21 25)` / `oklch(0.66 0.2 25)`
  - `--scrim: oklch(0 0 0 / 0.25)` / `oklch(0 0 0 / 0.45)`
- Remove `--kbd-shadow-*` (L48–50, L98–100). Kbd is flat.

**`packages/ui/src/styles/globals.css`**:
- L59–62: delete the shifted radius scale (`--radius-xl: +4px`, `--radius-lg: var(--radius)`, `--radius-md: −2px`, `--radius-sm: −4px`). The desktop's later `@layer theme` already overrides these at runtime: `rounded-lg` compiles to `var(--radius-lg)` and resolves to 0.5rem, verified in a compiled `/tmp` build. So packages/ui currently believes `lg` = 6px while it renders 8px.
- Add the `@theme` colour mappings (`--color-tertiary-foreground`, `--color-warm-strong`, `--color-warm-glow`, `--color-live`, `--color-scrim`) and the `--text-caption/label/ui/strong/body/title/page-title` roles with their `--line-height`, `--font-weight` and `--letter-spacing`. Add `--ease-standard: cubic-bezier(0.2,0,0,1)` and `--leading-reading: 1.6`.
- Add the global `:focus-visible { outline: 2px solid var(--warm-strong); outline-offset: 2px }`. L195–212 has two duplicate `@layer base` blocks (`@apply border-border` at L197, then `@apply border-border outline-ring/50` at L207). Keep one, and drop `outline-ring/50` because the outline comes from the global rule.

**`apps/desktop/src/styles/globals.css`**:
- L49 `--radius-full: var(--radius)` and L315 `.rounded-full { border-radius: var(--radius) }`: delete both. Every `rounded-full` in the app currently renders as a 6px rounded square, which is why chips, avatars and the round buttons read inconsistently.
- L50 `--radius-pill` and L330 `.rounded-pill`: delete. Their only users are the switch and the session header tabs, which become `rounded-full` and segmented respectively.
- L83 `--selection-overlay: rgba(59,130,246,0.3)` → `var(--warm-glow)`. Do the same in `dark-theme.css` L16.
- L288–296 `[data-settings-content] button … box-shadow: none !important`: delete once Button is flat (§2).
- L299–310 ProseMirror search: keep `color-mix(var(--warm) 30%)`, and change the active match `color: black` → `color: var(--warm-foreground)`. In `dark-theme.css` L20–28, change `rgb(113 63 18 / .45)` and `rgb(202 138 4)` → the same warm tokens, then delete the dark overrides.
- `body`: add `font-feature-settings: "cv11","ss01"` (coach).

**`apps/desktop/src/main.tsx`** L7 and L11: drop the `@fontsource/inter/700.css` and `ibm-plex-sans-arabic/700.css` imports once `font-bold` is gone.

**`packages/design-system/src/index.ts`** `DesignRadius.panel/sheet` (20, 24) is still used by `apps/mobile`, so don't change the values. Stop using it on the web once `packages/ui/src/lib/squircle.ts` is removed.

## 2. Shared components in `packages/ui`: the fixes that cascade

These are ordered by blast radius, counted as the number of desktop files importing each component. Fixing these first resolves most of the visual drift without touching call sites.

1. **`components/ui/button.tsx`** (55 files).
   - L12: `rounded-full` → `rounded-md`, `gap-2` → `gap-1.5`, `text-sm` → `text-ui`, `transition-all` → `transition-[background-color,color,opacity] duration-100`.
   - L18–25: variants become the coach tones (`cue.md` §6). Delete every `shadow-xs`. `outline` becomes secondary (`border-border bg-background hover:bg-muted active:bg-accent`). `ghost` becomes `text-muted-foreground hover:bg-muted hover:text-foreground`. `destructive` becomes the outline form.
   - L29–32: sizes `default h-9 px-4 py-2` → `h-8 px-3`; `sm h-7 px-2 text-xs` → `h-7 px-2.5 text-ui`; delete `lg h-10 px-8`; `icon size-7` stays.
   - L63: drop `useSquircleRef` and the `smoothCorners` prop. Lisse clip-paths it at 8px over whatever class is set and clips the focus outline.
   - Call sites that pass `rounded-full`, `h-8 rounded-full px-4 text-xs shadow-sm` and the like then become the plain `size="sm"` or default variant.
2. **`components/ui/floating-content.tsx` + `dropdown-menu.tsx` + `popover.tsx`** (21 + 13 files, about 30 `variant="app"` call sites).
   - Delete the two-layer chrome: `appFloatingContentClassName` (L21: `rounded-[22px] … p-0.5 shadow-lg`), `AppFloatingPanel` (L37: `rounded-[20px]`, Lisse `panelSquircle` L33), and `appFloatingItemClassName` (L24: `rounded-[14px]`). Replace with one container, `rounded-lg border border-border bg-popover p-1 shadow-lg`.
   - Items: `dropdown-menu.tsx` L31, L98, L115, L140 become `h-7 rounded-md px-2 text-ui data-[highlighted]:bg-muted`, with `pl-8` → `ps-8` and `pr-2` → `pe-2`. L57 and L80 (`rounded-[18px] … shadow-md`) become the container above. L168 label becomes `text-label font-medium text-muted-foreground`. L195 shortcut becomes `<Kbd>`.
   - `popover.tsx` L44: `rounded-[18px] border p-4 shadow-md` → `rounded-lg border border-border bg-popover p-3 shadow-lg`.
   - Replace the Radix `zoom-in-95` and `slide-in-from-*` animations with `.coach-enter`.
   - Then remove `<AppFloatingPanel className={appFloatingMenuPanelClassName}>` wrappers at every call site. Find them with `grep -rn AppFloatingPanel apps/desktop/src`. Desktop has 30+ of them, for example `sidebar/note-filter-menu.tsx:59`, `session/components/outer-header/overflow/index.tsx:146` and `session/components/note-input/template-picker.tsx:392`.
3. **`components/ui/toast.tsx` → `app-toast.tsx`** (21 files).
   - L539–540: `rounded-[14px] shadow-md` / `rounded-[20px] shadow-lg` → `rounded-lg border border-border shadow-lg`.
   - L432: drop the Lisse ref.
   - L553 `ring-1 ring-border/70` → `border border-border`.
   - L591: `text-[13px]`/`text-sm` → `text-ui`.
   - L659–660 action buttons → `Button size="sm"`.
   - L679–680 → `text-caption`/`text-label`.
   - L724 and L726: `text-emerald-600`/`text-amber-600` → `text-success`/`text-warm-strong` (icons).
4. **`components/ui/input.tsx`** (12 files): L11 `h-9 … px-3 py-1 text-base shadow-xs dark:bg-muted/60 focus-visible:ring-1 md:text-sm` → `h-8 rounded-md border border-input bg-background px-2.5 text-body placeholder:text-tertiary-foreground focus-visible:outline-none focus:border-foreground`. **`textarea.tsx`** (5) L12 gets the same change, with `rounded-lg px-3 py-2`.
5. **`components/ui/dialog.tsx`** (9 files).
   - L29 overlay: `bg-black/80` → `bg-scrim`.
   - L61 content: `gap-4 border bg-background p-6 shadow-lg sm:rounded-lg max-w-lg` → `gap-3 rounded-lg border border-border bg-background p-4 shadow-2xl max-w-[420px]`, using `.coach-enter` in place of zoom/slide.
   - L67 close: `rounded-xs`, `top-4 right-4` → `rounded-md`, `top-3 end-3` (a ghost icon button).
   - L83 header: `text-center sm:text-left` → `text-start`.
   - L112 title: `text-lg leading-none tracking-tight` → `text-title`.
   - L126 description: `text-sm` → `text-ui`.
   - `shared/ui/glass-dialog.tsx` and `destructive-confirmation-dialog.tsx` then lose their glass overrides (§4).
6. **`components/ui/tooltip.tsx`** (8 files): L54–55 `rounded-md px-2 py-1 text-xs border bg-popover … shadow-md` → coach: `rounded-md bg-primary px-2 py-1 text-caption font-medium text-primary-foreground shadow-lg`, with no border. Set the provider `delayDuration={500}`.
7. **`components/ui/select.tsx`** (7 files): L22 drop Lisse. L28 trigger `h-9 rounded-full … shadow-xs` → the input classes at `h-8 rounded-md`. L85 content `rounded-[18px] … shadow-md` → the menu container. L128 item → the menu item.
8. **`components/ui/badge.tsx`** (8 files): L8 → `inline-flex h-5 items-center gap-1 rounded-sm border border-border px-1.5 text-label font-medium text-muted-foreground`. Delete `default`/`destructive`/`secondary` fills and the `success` (`bg-green-500 text-white`) variant. L58: drop Lisse.
9. **`components/ui/switch.tsx`** (3 files, every settings toggle): L8 track → `h-5 w-9 rounded-full p-0.5` with `bg-foreground/45`, `bg-warm-strong dark:bg-warm` and no `border-2`. L24 thumb → `size-4 rounded-full bg-white shadow-sm translate-x-4` (`rtl:-translate-x-4`). Delete the `sm` and `lg` sizes.
10. **`components/ui/kbd.tsx`** (3 files plus `shortcut-hint`): L8–10 → coach Kbd: `rounded-sm border border-border bg-background px-1 text-[10.5px] leading-[1.5] font-medium text-muted-foreground tabular-nums`, `font-sans` and no shadow.
11. **`components/avatar.tsx`**: L78 Lisse 8px squircle → `rounded-full`. **Owner call:** avatars become circles, matching the coach dots.
12. **`components/ui/command.tsx`** (3 files): L18 `rounded-[18px]` → `rounded-lg`. L47 input `h-10 rounded-full` → `h-11 text-body` with no radius (coach palette). L121 item → the menu item. L138 shortcut → `<Kbd>`.
13. **`components/ui/checkbox.tsx`**: L15 `h-4 w-4 rounded-xs border-primary shadow-xs` → `size-3.5 rounded-sm border-input`, with checked state `border-primary bg-primary`.
14. **`components/ui/card.tsx`**: L14–15 `rounded-lg bg-background border shadow-xs` → drop the shadow. L70 `text-neutral-500` → `text-muted-foreground`.
15. **`components/ui/input-group.tsx`** (2), **`button-group.tsx`** (2), **`skeleton.tsx`** (`rounded-md animate-pulse` → `.coach-skeleton rounded-sm`), **`accordion.tsx`** (L31 `hover:underline` → `hover:text-foreground`), **`resizable.tsx`**: see the per-line list below.

### Per-line: `packages/ui`

#### `packages/ui/src/components/ui/app-toast.tsx`
- L539: `rounded-[14px]` → `rounded-lg` — off-scale radius; `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)
- L540: `rounded-[20px]` → `rounded-lg` — off-scale radius; `shadow-lg` → `shadow-lg` — popover level (coach menu/tooltip)
- L591: `text-[13px]` → `text-ui`
- L660: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L679: `text-[11px]` → `text-caption`
- L724: `text-emerald-600` → `text-success` — status colour: dot/icon only
- L726: `text-amber-600` → `text-warm-strong` — icon/mark only — amber never carries text

#### `packages/ui/src/components/ui/badge.tsx`
- L8: `rounded-full` → `rounded-sm` — badge (ext)
- L20: `bg-green-500` `text-white` `hover:bg-green-600` → delete the `success` variant — status = dot, not a coloured badge

#### `packages/ui/src/components/ui/button-group.tsx`
- L8: `rounded-r-full` → `rounded-e-md` — physical side → logical
- L13: `rounded-l-none` → `rounded-s-none` — physical side → logical; `rounded-r-none` → `rounded-e-none` — physical side → logical
- L52: `rounded-full` → `rounded-md` — control; `shadow-2xs` → — (remove) — flat surfaces; hairline border instead

#### `packages/ui/src/components/ui/button.tsx`
- L12: `rounded-full` → `rounded-md` — control
- L18: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L20: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L22: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L24: `shadow-xs` → — (remove) — flat surfaces; hairline border instead

#### `packages/ui/src/components/ui/card.tsx`
- L15: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L70: `text-neutral-500` → `text-muted-foreground`

#### `packages/ui/src/components/ui/carousel.tsx`
- L213: `rounded-full` → keep rounded-full — round floating nav button
- L246: `rounded-full` → keep rounded-full — round floating nav button

#### `packages/ui/src/components/ui/checkbox.tsx`
- L15: `rounded-xs` → `rounded-sm` — off-scale radius; `shadow-xs` → — (remove) — flat surfaces; hairline border instead

#### `packages/ui/src/components/ui/command.tsx`
- L18: `rounded-[18px]` → `rounded-lg` — off-scale radius
- L47: `rounded-full` → — (remove) — borderless input: no radius

#### `packages/ui/src/components/ui/dancing-sticks.tsx`
- L96: `rounded-full` → keep rounded-full — level bar
- L124: `rounded-full` → keep rounded-full — level bar

#### `packages/ui/src/components/ui/dialog.tsx`
- L29: `bg-black/80` → `bg-scrim`
- L61: `shadow-lg` → `shadow-2xl` — dialog level (coach palette)
- L67: `rounded-xs` → `rounded-sm` — off-scale radius
- L112: `text-lg` → `text-title`

#### `packages/ui/src/components/ui/dropdown-menu.tsx`
- L57: `rounded-[18px]` → `rounded-lg` — off-scale radius; `shadow-lg` → `shadow-lg` — popover level (coach menu/tooltip)
- L80: `rounded-[18px]` → `rounded-lg` — off-scale radius; `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)
- L150: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted

#### `packages/ui/src/components/ui/floating-content.tsx`
- L21: `rounded-[22px]` → `rounded-lg` — off-scale radius; `shadow-lg` → `shadow-lg` — popover level (coach menu/tooltip)
- L24: `rounded-[14px]` → `rounded-lg` — off-scale radius
- L37: `rounded-[20px]` → `rounded-lg` — off-scale radius

#### `packages/ui/src/components/ui/input-group.tsx`
- L16: `shadow-2xs` → — (remove) — flat surfaces; hairline border instead
- L35: `rounded-[calc(var(--radius)-5px)]` → `rounded-sm` — off-scale radius
- L82: `rounded-[calc(var(--radius)-5px)]` → `rounded-sm` — off-scale radius
- L85: `rounded-[calc(var(--radius)-5px)]` → `rounded-sm` — off-scale radius

#### `packages/ui/src/components/ui/input.tsx`
- L11: `shadow-xs` → — (remove) — flat surfaces; hairline border instead; `text-base` → `text-body` — 16px body is off-scale

#### `packages/ui/src/components/ui/kbd.tsx`
- L8: `rounded` → `rounded-sm` — bare `rounded` → named step
- L10: `shadow-[0_1px_0_0_var(--kbd-shadow-outer),inset_0_1px_0_0_var(--kbd-shadow-inset)]` → — (remove) — flat surfaces; hairline border instead

#### `packages/ui/src/components/ui/popover.tsx`
- L44: `rounded-[18px]` → `rounded-lg` — off-scale radius; `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)

#### `packages/ui/src/components/ui/resizable.tsx`
- L45: `rounded-xs` → `rounded-sm` — off-scale radius

#### `packages/ui/src/components/ui/select.tsx`
- L28: `rounded-full` → `rounded-md` — control; `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L85: `rounded-[18px]` → `rounded-lg` — off-scale radius; `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)

#### `packages/ui/src/components/ui/spinner.tsx`
- L38: `rounded-full` → keep rounded-full — spinner tick

#### `packages/ui/src/components/ui/switch.tsx`
- L8: `rounded-pill` → `rounded-full` — switch track; drop [corner-shape:round]
- L24: `bg-white` → keep bg-white — allowed: switch thumb; `rounded-pill` → `rounded-full` — switch thumb; `shadow-sm` → keep shadow-sm — allowed: switch thumb

#### `packages/ui/src/components/ui/textarea.tsx`
- L12: `shadow-xs` → — (remove) — flat surfaces; hairline border instead; `text-base` → `text-body` — 16px body is off-scale

#### `packages/ui/src/components/ui/tooltip.tsx`
- L55: `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)

## 3. Hotspots

`devtools-bar/*` is dev-only (gated by `commands.showDevtool`). Scope its root in `className="dark"` and use tokens; don't keep a second hand-rolled dark palette.

#### `devtools-bar/hint.tsx`
- L21: `backdrop-blur` → — (remove) — no blur outside window chrome; use an opaque token surface; `border-neutral-700` → `border-border`; `bg-neutral-900/95` → `bg-background` — dark-only chrome: scope .dark; `text-neutral-200` → `text-foreground` — dark-only chrome: scope .dark; `shadow-xl` → `shadow-lg` — popover level (coach menu/tooltip)
- L22: `text-[11px]` → `text-caption`

#### `devtools-bar/index.tsx`
- L55: `bg-sky-400` → `bg-warm` — dev = Amber Cue icon variant
- L56: `bg-amber-400` → `bg-muted-foreground` — channel dot = Cue icon variant (stable white, staging silver)
- L57: `bg-violet-400` → `bg-muted-foreground` — channel dot = Cue icon variant (stable white, staging silver)
- L58: `bg-neutral-400` → `bg-foreground` — channel dot = Cue icon variant (stable white, staging silver)
- L62: `text-sky-300` → `text-foreground` — channel name stays neutral; the dot carries the channel
- L63: `text-amber-300` → `text-foreground` — channel name stays neutral; the dot carries the channel
- L64: `text-violet-300` → `text-foreground` — channel name stays neutral; the dot carries the channel
- L65: `text-neutral-200` → `text-foreground` — channel name stays neutral; the dot carries the channel
- L73: `hover:bg-white/8` → `hover:bg-accent`; `focus-visible:bg-white/8` → `focus-visible:bg-accent`
- L74: `bg-white/8` → `bg-accent`
- L76: `text-neutral-500` → `text-muted-foreground`
- L77: `text-neutral-100` → `text-foreground` — dark-only chrome: scope .dark
- L82: `text-neutral-100` → `text-foreground` — dark-only chrome: scope .dark
- L83: `text-amber-400` → `text-warm-strong` — icon/mark only — amber never carries text
- L84: `text-red-400` → `text-destructive`
- L136: `border-neutral-800` → `border-border`; `bg-neutral-900` → `bg-background` — dark-only chrome: scope .dark
- L137: `hover:bg-neutral-700` → `hover:bg-accent`
- L143: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L158: `border-neutral-800` → `border-border`; `bg-neutral-900` → `bg-background` — dark-only chrome: scope .dark; `text-neutral-300` → `text-foreground` — dark-only chrome: scope .dark
- L159: `text-[11px]` → `text-caption`
- L170: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L182: `text-neutral-500` → `text-muted-foreground`
- L305: `text-violet-300` → `text-muted-foreground` — no hue in Cue; `text-neutral-500` → `text-muted-foreground`
- L442: `text-neutral-400` → `text-muted-foreground`
- L449: `text-neutral-300` → `text-foreground` — dark-only chrome: scope .dark
- L452: `text-neutral-100` → `text-foreground` — dark-only chrome: scope .dark
- L458: `text-neutral-500` → `text-muted-foreground`
- L610: `text-neutral-400` → `text-muted-foreground`

#### `devtools-bar/react-scan-controls.tsx`
- L60: `hover:bg-white/8` → `hover:bg-accent`; `aria-pressed:bg-white/15` → `aria-pressed:bg-accent`

#### `devtools-bar/scan-panel.tsx`
- L24: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L68: `rounded-[22px]` → `rounded-lg` — off-scale radius; `shadow-xl` → `shadow-2xl` — dialog level (coach palette); `text-[11px]` → `text-caption`
- L105: `rounded-xl` → `rounded-md` — off-scale radius
- L107: `shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L117: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L121: `bg-amber-500` → `bg-warm`
- L122: `bg-blue-500` → `bg-muted-foreground` — no hue in Cue (dot) — or bg-muted for fills
- L167: `shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L333: `shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L346: `rounded-lg` → `rounded-md` — control/row on 8px → 6px; `shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L362: `rounded-xl` → `rounded-lg` — off-scale radius; `text-[11px]` → `text-caption`
- L392: `rounded-xl` → `rounded-lg` — off-scale radius
- L466: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L468: `bg-blue-500` → `bg-muted-foreground` — no hue in Cue (dot) — or bg-muted for fills; `rounded` → `rounded-full` — progress fill inside rounded-full track

#### `settings/ai/stt/select.tsx`
- L268: `text-[15px]` → `text-title`
- L276: `rounded-[18px]` → `rounded-lg` — off-scale radius
- L305: `text-[11px]` → `text-caption`
- L342: `rounded-[18px]` → `rounded-lg` — off-scale radius
- L354: `text-[11px]` → `text-caption`
- L365: `text-green-600` → `text-success` — status colour: dot/icon only
- L380: `text-[11px]` → `text-caption`
- L499: `text-amber-500` → `text-warm-strong` — icon/mark only — amber never carries text
- L868: `text-[11px]` → `text-caption`
- L881: `rounded-full` → `rounded-md` — control
- L914: `rounded-full` → `rounded-md` — control
- L924: `rounded-full` → `rounded-sm` — badge/tag; `text-[11px]` → `text-caption`
- L926: `from-muted` `to-accent` `bg-linear-to-t` → — (remove) — no gradients; solid token surface
- L940: `rounded-full` → `rounded-sm` — badge/tag; `text-[11px]` → `text-caption`
- L945: `from-muted` `to-accent` `bg-linear-to-t` → — (remove) — no gradients; solid token surface; `shadow-xs` → — (remove) — flat surfaces; hairline border instead; `hover:shadow-md` → — (remove) — hover = bg-muted, not elevation
- L981: `text-[11px]` → `text-caption`
- L1004: `text-[11px]` → `text-caption`
- L1073: `rounded-r-full` → `rounded-e-md` — physical side → logical
- L1084: `rounded-full` → `rounded-md` — row action icon button
- L1100: `rounded-full` → `rounded-md` — row action icon button
- L1101: `text-red-500` → `text-destructive`; `hover:text-red-600` → `hover:text-destructive`

#### `settings/appearance/theme.tsx`
- L37: `text-[15px]` → `text-title`
- L59: `rounded-2xl` → `rounded-lg` — option card
- L61: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L80: `rounded-full` → keep rounded-full — avatar/icon disc
- L82: `blur-none` → — (remove) — animate opacity + scale only
- L83: `blur-[4px]` → `scale-90 opacity-0` — drop blur; scale-25 → scale-90
- L115: `bg-neutral-950` → `bg-background` — dark-only chrome: scope .dark; `text-neutral-100` → `text-foreground` — dark-only chrome: scope .dark; `bg-white` → `bg-background`; `text-neutral-900` → `text-foreground`
- L119: `bg-red-400` → `bg-destructive`; `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L120: `bg-amber-400` → `bg-warm`; `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L121: `bg-green-400` → `bg-success` — status colour: dot/icon only; `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L127: `bg-neutral-800` → `bg-background` — dark-only chrome: scope .dark; `bg-neutral-100` → `bg-muted`
- L133: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L134: `bg-neutral-300` → `bg-border`; `bg-neutral-700` → `bg-accent`
- L139: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L140: `bg-neutral-700` `bg-neutral-200` → `bg-accent`
- L145: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L146: `bg-neutral-700` `bg-neutral-200` → `bg-accent`
- L151: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L152: `bg-neutral-700` `bg-neutral-200` → `bg-accent`

#### `contacts/details.tsx`
- L262: `text-base` → `text-body` — 16px body is off-scale
- L451: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L456: `rounded-full` → `rounded-sm` — skeleton bar (coach-skeleton = radius-sm)
- L523: `text-base` → `text-body` — 16px body is off-scale
- L549: `text-base` → `text-body` — 16px body is off-scale
- L576: `text-base` → `text-body` — 16px body is off-scale
- L615: `text-base` → `text-body` — 16px body is off-scale
- L654: `text-base` → `text-body` — 16px body is off-scale
- L682: `text-base` → `text-body` — 16px body is off-scale
- L710: `text-base` → `text-body` — 16px body is off-scale
- L746: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L752: `text-base` → `text-body` — 16px body is off-scale
- L755: `hover:text-red-600` → `hover:text-destructive`
- L764: `text-base` → `text-body` — 16px body is off-scale
- L853: `rounded-xs` → `rounded-sm` — off-scale radius
- L871: `rounded-xs` → `rounded-sm` — off-scale radius
- L883: `rounded-full` → keep rounded-full — avatar/icon disc
- L902: `rounded-full` → keep rounded-full — avatar/icon disc
- L917: `rounded-xs` → `rounded-sm` — off-scale radius
- L929: `rounded-full` → keep rounded-full — avatar/icon disc

#### `shared/open-note-dialog.tsx`
- L356: `bg-black/20` → `bg-scrim`
- L389: `rounded-xl` → `rounded-lg` — off-scale radius
- L390: `shadow-[0_24px_48px_-16px_rgba(0,0,0,0.3)]` → `shadow-2xl` — dialog level (coach palette)
- L409: `text-[14px]` → `text-body`
- L413: `rounded` `text-[10px]` → <Kbd> — use the Kbd component (10.5px, rounded-sm)
- L434: `text-[11px]` → `text-caption`
- L449: `text-[11px]` → `text-caption`
- L495: `text-[13px]` → `text-ui`

#### `settings/general/storage/legacy-cleanup.tsx`
- L148: `text-green-600` → `text-success` — status colour: dot/icon only
- L151: `text-yellow-600` → `text-warm-strong` — icon/mark only — amber never carries text
- L199: `backdrop-blur-xl` → — (remove) — no blur outside window chrome; use an opaque token surface; `rounded-[26px]` → `rounded-lg` — off-scale radius; `sm:rounded-[26px]` → `sm:rounded-lg` — off-scale radius; `shadow-[0_24px_70px_rgba(0,0,0,0.32)]` → `shadow-2xl` — dialog level (coach palette)
- L201: `text-[13px]` → `text-title` — dialog title
- L204: `text-[13px]` → `text-ui`
- L214: `text-red-500` → `text-destructive`
- L222: `rounded-full` → `rounded-md` — control
- L230: `rounded-full` → `rounded-md` — control; `shadow-sm` → — (remove) — flat surfaces; hairline border instead

#### `sidebar/timeline/item.tsx`
- L230: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L246: `text-[11px]` → `text-caption`
- L262: `text-[11px]` → `text-caption`
- L267: `bg-destructive` → `bg-live` — recording dot (coach --live); `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L274: `text-[11px]` → `text-caption`
- L305: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L309: `rounded-full` → keep rounded-full — level fill inside the track

#### `onboarding/shared.tsx`
- L68: `text-green-600` → `text-success` — status colour: dot/icon only
- L77: `text-xl` → `text-page-title`
- L88: `rounded` → `rounded-sm` — bare `rounded` → named step
- L112: `rounded` → `rounded-sm` — bare `rounded` → named step
- L155: `rounded-full` → `rounded-md` — control
- L157: `shadow-[0_2px_6px_rgba(87,83,78,0.22),0_10px_18px_-10px_rgba(87,83,78,0.65)]` → — (remove) — not a floating layer
- L159: `backdrop-blur-sm` → — (remove) — no blur outside window chrome; use an opaque token surface; `shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]` → — (remove) — flat surfaces; hairline border instead
- L177: `text-emerald-600` → `text-success` — status colour: dot/icon only
- L181: `text-red-400` → `text-destructive`
- L184: `text-red-500` → `text-destructive`

#### `sidebar/folder-materials.tsx`
- L38: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L52: `rounded-full` → `rounded-md` — control
- L65: `rounded-full` → `rounded-md` — control
- L86: `rounded-full` → `rounded-md` — control
- L114: `text-[11px]` → `text-caption`
- L135: `rounded-full` → `rounded-md` — control

#### `session/components/outer-header/overflow/export-modal.tsx`
- L407: `backdrop-blur-xs` → — (remove) — no blur outside window chrome; use an opaque token surface; `bg-black/20` → `bg-scrim`
- L415: `rounded-xl` → `rounded-lg` — off-scale radius
- L416: `shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]` → `shadow-2xl` — dialog level (coach palette)
- L421: `text-base` → `text-title`
- L497: `text-red-500` → `text-destructive`
- L509: `rounded-full` → `rounded-md` — control; `shadow-[0_4px_14px_rgba(87,83,78,0.4)]` → — (remove) — not a floating layer

#### `session/components/note-input/transcript/renderer/speaker-assign.tsx`
- L105: `rounded-full` → `rounded-md` — control
- L115: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L529: `text-[11px]` → `text-caption`
- L550: `text-[11px]` → `text-caption`
- L600: `rounded-full` → `rounded-md` — control
- L644: `rounded-full` → keep rounded-full — avatar/icon disc

#### `session/components/note-input/transcript/renderer/selection-menu.tsx`
- L56: `rounded-md` → `rounded-lg` — menu container; `shadow-lg` → keep shadow-lg — menu level
- L60: `rounded-xs` → `rounded-sm` — off-scale radius
- L168: `rounded-full` → `rounded-lg` — floating toolbar container; `shadow-lg` → `shadow-lg` — popover level (coach menu/tooltip)
- L186: `rounded-full` → `rounded-md` — control
- L211: `rounded-full` → `rounded-md` — control
- L225: `rounded-full` → `rounded-md` — control
- L238: `rounded-full` → `rounded-md` — control

#### `task/resource-view.tsx`
- L98: `text-xl` → `text-page-title`
- L137: `rounded-full` → `rounded-sm` — badge/tag
- L165: `rounded-full` → keep rounded-full — avatar/icon disc
- L212: `rounded-full` → keep rounded-full — avatar/icon disc
- L289: `rounded-full` → `rounded-sm` — badge/tag

## 4. Everything else in `apps/desktop/src`

Shared dialogs: `shared/ui/glass-dialog.tsx`, `shared/ui/destructive-confirmation-dialog.tsx`, `calendar/components/apple/permission.tsx`, `sidebar/folder-name-dialog.tsx`, `settings/general/storage/legacy-cleanup.tsx` and `outer-header/overflow/export-modal.tsx` each re-implement a glass dialog (`rounded-[26px]`, `bg-card/60 backdrop-blur-2xl`, custom shadow, 13px centred title, `rounded-full` buttons). Once `dialog.tsx` follows the spec, delete `glass-dialog.tsx` and make the others plain `DialogContent` with left-aligned `text-title`, `text-ui` copy, and a `Button size="sm"` footer.

### audio-player/

#### `audio-player/timeline-shell.tsx`
- L28: `rounded-xl` → `rounded-lg` — off-scale radius

#### `audio-player/timeline.tsx`
- L97: `rounded-full` → keep rounded-full — round play button (coach send button)
- L100: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L130: `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L139: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

### calendar/

#### `calendar/components/apple/permission.tsx`
- L39: `text-[13px]` → `text-title` — dialog title
- L42: `text-[13px]` → `text-ui`
- L54: `dark:bg-white` `dark:text-black` `dark:hover:bg-white/90` → — (remove) — the token already themes dark; `rounded-full` → `rounded-md` — control; `shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L134: `text-red-500` → `text-destructive`

#### `calendar/components/calendar-selection.tsx`
- L86: `rounded` → `rounded-sm` — bare `rounded` → named step
- L149: `rounded-full` → `rounded-md` — control
- L174: `rounded-full` → `rounded-md` — control
- L224: `rounded` → `rounded-sm` — bare `rounded` → named step

#### `calendar/components/calendar-view.tsx`
- L245: `rounded-full` → `rounded-md` — control

#### `calendar/components/day-cell.tsx`
- L106: `rounded-full` → keep rounded-full — date disc

#### `calendar/components/event-chip.tsx`
- L111: `rounded` → `rounded-sm` — bare `rounded` → named step
- L122: `rounded` → `rounded-sm` — bare `rounded` → named step
- L128: `rounded-full` → keep rounded-full — colour bar

#### `calendar/components/session-chip.tsx`
- L87: `rounded` → `rounded-sm` — bare `rounded` → named step
- L92: `rounded-full` → keep rounded-full — colour bar
- L136: `text-base` → `text-title`

#### `calendar/components/shared.tsx`
- L18: `rounded-[4px]` → `rounded-sm` — off-scale radius

#### `calendar/components/sidebar.tsx`
- L159: `rounded-full` → `rounded-md` — control
- L184: `rounded-full` → `rounded-md` — control
- L198: `rounded-full` → `rounded-md` — control

### changelog/

#### `changelog/index.tsx`
- L150: `text-xl` → `text-page-title`

### contacts/

#### `contacts/contact-avatar.tsx`
- L36: `rounded-full` → keep rounded-full — avatar
- L37: `border-black/10` → `border-border`; `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L72: `rounded-full` → keep rounded-full — avatar
- L77: `rounded-full` → keep rounded-full — avatar hover overlay
- L78: `bg-black/40` → `bg-scrim`; `text-white` → keep text-white — allowed: text on bg-scrim over a photo

#### `contacts/contact-page-header.tsx`
- L63: `rounded-full` → `rounded-md` — control
- L95: `text-red-600` `dark:text-red-400` → `text-destructive data-[highlighted]:bg-destructive/10 (coach danger)` — one class set; no dark: variants
- L96: `hover:bg-red-50` `hover:text-red-700` `dark:hover:bg-red-950/50` `dark:hover:text-red-300` → — (remove) — covered by the line above

#### `contacts/new-person-form.tsx`
- L50: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

#### `contacts/organization-details.tsx`
- L51: `rounded-full` → keep rounded-full — avatar/icon disc
- L98: `rounded-full` → keep rounded-full — avatar placeholder
- L135: `hover:shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L242: `text-base` → `text-body` — 16px body is off-scale

#### `contacts/organization-item.tsx`
- L63: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L70: `rounded-full` → keep rounded-full — avatar placeholder
- L80: `rounded-xs` → `rounded-sm` — off-scale radius

#### `contacts/person-item.tsx`
- L69: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L100: `rounded-xs` → `rounded-sm` — off-scale radius

#### `contacts/related-notes.tsx`
- L76: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L111: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted

#### `contacts/shared.tsx`
- L156: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

### editor-bridge/

#### `editor-bridge/session-view.tsx`
- L137: `bg-red-500` → `bg-live` — recording dot (coach --live); `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted

### folders/

#### `folders/folder-editor.tsx`
- L167: `text-red-600` → `text-destructive`; `focus:text-red-600` → `focus:text-destructive`
- L249: `rounded-full` → `rounded-md` — remove button on the cover

#### `folders/sidebar.tsx`
- L65: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L138: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

### lock/

#### `lock/screen.tsx`
- L33: `rounded-full` → keep rounded-full — icon disc
- L36: `text-lg` → `text-title`

### main/

#### `main/sidebar-timeline-chrome.tsx`
- L164: `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted

#### `main/windows-window-controls.tsx`
- L101: `hover:text-white` `hover:bg-[#c42b1c]` → keep — OS-native Windows close button colour

### onboarding/

#### `onboarding/calendar.tsx`
- L44: `backdrop-blur-md` `backdrop-saturate-150` → — (remove) — no blur outside window chrome; use an opaque token surface; `rounded-xl` → `rounded-lg` — off-scale radius; `shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_-20px_rgba(87,83,78,0.35)]` → — (remove) — flat surfaces; hairline border instead
- L82: `shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)]` → — (remove) — not a floating layer
- L88: `rounded-[4px]` → `rounded-sm` — off-scale radius

#### `onboarding/final.tsx`
- L106: `text-red-500` → `text-destructive`

#### `onboarding/index.tsx`
- L149: `from-background/8` `via-background/18` `bg-linear-to-t` `to-transparent` → — (remove) — owner call: flat bg-background, video in a rounded-lg border frame
- L151: `backdrop-blur-[32px]` → — (remove) — owner call: no blur veils
- L152: `backdrop-blur-[12px]` → — (remove) — owner call: no blur veils
- L153: `from-background` `via-background/82` `via-background/97` `to-background/0` `bg-linear-to-b` `via-18` `via-42` → — (remove) — owner call: no gradient veils
- L169: `rounded-full` → `rounded-md` — control
- L187: `text-3xl` → `text-page-title`

#### `onboarding/permissions.tsx`
- L66: `rounded-xl` → `rounded-md` — off-scale radius
- L69: `shadow-[0_4px_14px_rgba(87,83,78,0.18)]` → — (remove) — not a floating layer
- L83: `text-green-600` → `text-success` — status colour: dot/icon only

### session/

#### `session/components/folder-picker.tsx`
- L71: `rounded-full` → `rounded-md` — trigger button
- L89: `text-neutral-600` → `text-muted-foreground`; `dark:text-neutral-300` → — (remove) — one class: text-muted-foreground

#### `session/components/note-conflict-banner.tsx`
- L42: `border-amber-500/35` → `border-border`; `bg-amber-500/10` → `bg-card` — no tinted fill; amber stays on the icon; `rounded-[22px]` → `rounded-lg` — banner = card
- L45: `text-amber-600` → `text-warm-strong` — icon/mark only — amber never carries text; `dark:text-amber-400` → — (remove) — the token already themes dark
- L48: `text-[13px]` → `text-ui`

#### `session/components/note-input/audio-drop-target.tsx`
- L28: `shadow-inner` → — (remove) — flat surfaces; hairline border instead
- L33: `rounded-md` → `rounded-lg` — card/container → 8px; `shadow-sm` → — (remove) — flat surfaces; hairline border instead

#### `session/components/note-input/enhanced/config-error.tsx`
- L16: `text-base` → `text-title`

#### `session/components/note-input/enhanced/enhance-error.tsx`
- L46: `text-base` → `text-title`

#### `session/components/note-input/enhanced/streaming.tsx`
- L20: `text-[1.5rem]` → keep (editor H1) — match packages/editor H1; weight only; `font-bold` → `font-semibold` — weights: 400/500/600 only
- L26: `text-[1.5rem]` → keep (editor H1) — match packages/editor H1; weight only; `font-bold` → `font-semibold` — weights: 400/500/600 only
- L76: `rounded-bl-[2px]` → `rounded-es-sm` — physical side → logical; off-scale radius

#### `session/components/note-input/header-enhanced.tsx`
- L261: `text-red-600` `hover:bg-red-50` `hover:text-red-700` `focus-visible:bg-red-50` → `text-destructive data-[highlighted]:bg-destructive/10 (coach danger)` — one class set; no dark: variants
- L262: `dark:text-red-400` `dark:hover:bg-red-950/50` `dark:hover:text-red-300` `dark:focus-visible:bg-red-950/50` → — (remove) — covered by the line above
- L265: `focus-visible:bg-white` → `focus-visible:bg-muted`
- L266: `dark:focus-visible:bg-white` → — (remove) — covered by focus-visible:bg-muted

#### `session/components/note-input/header-shared.tsx`
- L101: `rounded-pill` → `rounded-sm` — segmented item (6 − 2px inset)
- L104: `bg-white` → `bg-background ring-1 ring-border` — selected segment; `shadow-xs` → — (remove) — selected segment is flat

#### `session/components/note-input/header.tsx`
- L61: `rounded-pill` → `rounded-md` — segmented track: bg-muted p-0.5 (drop p-[2px], gap-[2px], [corner-shape:round])

#### `session/components/note-input/meeting-chat-highlights.tsx`
- L21: `rounded-xl` → `rounded-lg` — card

#### `session/components/note-input/meeting-screen-gallery.tsx`
- L46: `rounded-xl` → `rounded-lg` — card

#### `session/components/note-input/search/bar.tsx`
- L210: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L252: `text-[10px]` → `text-caption`
- L301: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

#### `session/components/note-input/template-picker.tsx`
- L392: `rounded-[20px]` → `rounded-lg` — off-scale radius
- L413: `rounded-xs` → `rounded-sm` — off-scale radius
- L421: `rounded-b-[20px]` → `rounded-b-lg` — off-scale radius
- L610: `text-rose-500` → `text-foreground` — favourite = filled icon, not red
- L624: `text-[11px]` → `text-caption`

#### `session/components/note-input/transcript/renderer/index.tsx`
- L530: `rounded-full` → `rounded-md` — control
- L531: `backdrop-filter]` → drop backdrop-filter from the transition list
- L532: `hover:backdrop-blur-md` → — (remove) — no blur outside window chrome; use an opaque token surface; `hover:shadow-sm` → — (remove) — flat surfaces; hairline border instead
- L533: `focus-within:backdrop-blur-md` → — (remove) — no blur outside window chrome; use an opaque token surface; `focus-within:shadow-sm` → — (remove) — flat surfaces; hairline border instead

#### `session/components/note-input/transcript/renderer/segment-header.tsx`
- L32: `rounded-full` → keep rounded-full — avatar/icon disc

#### `session/components/note-input/transcript/renderer/segment.tsx`
- L132: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L174: `rounded-xs` → `rounded-sm` — off-scale radius

#### `session/components/note-input/transcript/renderer/separator.tsx`
- L8: `font-light` → `font-normal` — weights: 400/500/600 only

#### `session/components/note-input/transcript/renderer/word-span.tsx`
- L65: `text-black` → `text-warm-foreground` — active search word on bg-warm

#### `session/components/note-input/transcript/screens/batch.tsx`
- L38: `text-base` → `text-title`

#### `session/components/note-input/transcript/screens/empty.tsx`
- L44: `text-base` → `text-title`
- L71: `text-base` → `text-title`
- L104: `text-base` → `text-title`

#### `session/components/note-input/transcript/screens/listening.tsx`
- L27: `text-base` → `text-title`

#### `session/components/outer-header/index.tsx`
- L247: `text-red-500` → `text-destructive`
- L303: `shadow-sm` → `shadow-lg` — floating countdown tip

#### `session/components/outer-header/metadata/date.tsx`
- L44: `rounded-full` → `rounded-md` — control
- L155: `hover:bg-red-50` → `hover:bg-destructive/10 hover:text-destructive` — coach danger hover; `hover:text-red-600` `dark:hover:bg-red-950/50` `dark:hover:text-red-300` → — (remove) — coach danger hover; `rounded-full` → `rounded-md` — icon button
- L169: `hover:bg-green-50` `hover:text-green-600` `dark:hover:bg-green-950/50` `dark:hover:text-green-300` `rounded-full` → `hover:bg-muted hover:text-foreground` — status hues never on hover fills
- L186: `text-red-600` → `text-destructive`

#### `session/components/outer-header/metadata/index.tsx`
- L142: `text-base` → `text-title`

#### `session/components/outer-header/metadata/participants/chip.tsx`
- L77: `bg-linear-to-r` `from-transparent` `via-white/60` `to-transparent` → .coach-skeleton on the chip — no shimmer sweep

#### `session/components/outer-header/metadata/participants/dropdown.tsx`
- L50: `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)

#### `session/components/outer-header/overflow/delete.tsx`
- L23: `text-red-600` `dark:text-red-400` → `text-destructive data-[highlighted]:bg-destructive/10 (coach danger)` — one class set; no dark: variants
- L24: `hover:bg-red-50` `hover:text-red-700` `dark:hover:bg-red-950/50` `dark:hover:text-red-300` → — (remove) — covered by the line above

#### `session/components/outer-header/overflow/index.tsx`
- L140: `rounded-full` → `rounded-md` — control

#### `session/components/session-surface.tsx`
- L33: `blur-[22px]` → `opacity-40` — dim gated content under bg-scrim instead of blurring it (owner call)

#### `session/components/shared.tsx`
- L119: `bg-red-500/40` → `bg-live` — recording dot (coach --live); `animate-ping` → `coach-live-dot` — one pulse style; `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted
- L120: `bg-red-500` → `bg-live` — recording dot (coach --live); `rounded-full` → keep rounded-full — dot/avatar/track: becomes a true circle once the 6px remap is deleted

#### `session/components/title-input.tsx`
- L89: `text-xl` → `text-page-title`
- L112: `text-xl` → `text-page-title`
- L399: `text-xl` → `text-page-title`
- L453: `text-neutral-700` → `text-foreground`; `dark:text-white` → — (remove) — one class: text-foreground
- L454: `text-xl` → `text-page-title`
- L473: `text-xl` → `text-page-title`

#### `session/components/version-history-dialog.tsx`
- L66: `text-base` → `text-title`
- L89: `text-[11px]` → `text-caption`
- L126: `text-red-500` → `text-destructive`

#### `session/folder-instructions.tsx`
- L38: `text-[11px]` → `text-caption`

#### `session/index.tsx`
- L288: `rounded-[22px]` → `rounded-lg` — off-scale radius

### settings/

#### `settings/ai/shared/index.tsx`
- L428: `rounded-[22px]` → `rounded-lg` — off-scale radius
- L583: `text-[11px]` → `text-caption`
- L584: `rounded-full` → `rounded-sm` — badge/tag; `font-light` → `font-normal` — weights: 400/500/600 only

#### `settings/ai/shared/provider-search.tsx`
- L34: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

#### `settings/ai/stt/configure.tsx`
- L29: `text-[15px]` → `text-title`

#### `settings/ai/stt/local-file-model.tsx`
- L89: `rounded-full` → `rounded-md` — control
- L106: `text-[11px]` → `text-caption`
- L117: `rounded-full` → `rounded-md` — control
- L128: `text-green-600` → `text-success` — status colour: dot/icon only

#### `settings/ai/stt/model-icon.tsx`
- L148: `text-[10px]` → `text-caption`
- L170: `text-[10px]` → `text-caption`

#### `settings/ai/stt/shared.tsx`
- L1055: `rounded-xs` → `rounded-sm` — off-scale radius
- L1082: `rounded-xs` → `rounded-sm` — off-scale radius
- L1173: `rounded-xs` → `rounded-sm` — off-scale radius

#### `settings/appearance/app-icon.tsx`
- L56: `text-[15px]` → `text-title`
- L90: `rounded-[18px]` → keep — icon preview mirrors the app-icon mask (22.5% of tile)

#### `settings/appearance/sidebar-item-fields.tsx`
- L16: `text-[15px]` → `text-title`

#### `settings/claude/instructions.tsx`
- L39: `text-[15px]` → `text-title`

#### `settings/claude/tools.tsx`
- L267: `text-[15px]` → `text-title`

#### `settings/dictionary/index.tsx`
- L85: `rounded-full` → `rounded-md` — control
- L109: `bg-black` `text-white` `hover:bg-black/90` `hover:text-white` `dark:bg-white` `dark:text-black` `dark:hover:bg-white/90` `dark:hover:text-black` `rounded-full` → `bg-primary text-primary-foreground hover:opacity-90 active:opacity-80` — primary button (one class set for both themes)
- L132: `rounded-2xl` → `rounded-lg` — off-scale radius
- L156: `rounded-2xl` → `rounded-lg` — off-scale radius

#### `settings/general/index.tsx`
- L162: `rounded-full` → keep rounded-full — switch skeleton
- L236: `text-[15px]` → `text-title`
- L243: `text-[15px]` → `text-title`
- L253: `text-[15px]` → `text-title`
- L365: `text-[15px]` → `text-title`

#### `settings/general/notification.tsx`
- L456: `rounded-2xl` → `rounded-md` — tag input field
- L493: `text-[10px]` → `text-caption`

#### `settings/general/permissions.tsx`
- L62: `text-red-500` → `text-destructive`
- L70: `text-red-500` → `text-destructive`
- L83: `text-green-600` → `text-success` — status colour: dot/icon only; `hover:text-green-600` → `hover:text-success` — status colour: dot/icon only
- L114: `text-[15px]` → `text-title`

#### `settings/general/searchable-select.tsx`
- L148: `text-[11px]` → `text-caption`

#### `settings/general/spoken-languages.tsx`
- L126: `rounded-2xl` → `rounded-md` — off-scale radius
- L189: `rounded-2xl` → `rounded-lg` — off-scale radius; `shadow-md` → `shadow-lg` — popover level (coach menu/tooltip)

#### `settings/general/storage/export-location.tsx`
- L54: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L99: `text-red-500` → `text-destructive`

#### `settings/general/storage/index.tsx`
- L14: `text-[15px]` → `text-title`

#### `settings/page-title.tsx`
- L5: `text-2xl` → `text-page-title`

#### `settings/shortcut-recorder.tsx`
- L141: `rounded` → `rounded-sm` — bare `rounded` → named step

#### `settings/todo/index.tsx`
- L36: `rounded-full` → `rounded-md` — control

#### `settings/todo/shared.tsx`
- L18: `rounded-[4px]` → `rounded-sm` — off-scale radius

### shared/

#### `shared/brand-loading-view.tsx`
- L19: `drop-shadow-[0_10px_24px_rgba(0,0,0,0.10)]` → — (remove) — mark is flat
- L20: `dark:drop-shadow-[0_12px_28px_rgba(0,0,0,0.45)]` → — (remove) — mark is flat

#### `shared/control.tsx`
- L70: `rounded-xl` → `rounded-lg` — off-scale radius; `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L73: `rounded-full` → keep rounded-full — icon disc
- L82: `text-red-500` → `text-destructive`
- L86: `text-base` → `text-title`
- L129: `rounded-xl` → `rounded-lg` — off-scale radius; `shadow-xs` → — (remove) — flat surfaces; hairline border instead
- L132: `rounded-full` → keep rounded-full — icon disc
- L146: `text-4xl` → `text-page-title`; `font-bold` → `font-semibold` — weights: 400/500/600 only
- L157: `text-base` → `text-title`

#### `shared/long-load-gate.tsx`
- L128: `text-base` → `text-title`

#### `shared/main/index.tsx`
- L66: `rounded-xl` → keep rounded-xl — window-level surface

#### `shared/main/shell-scaffold.tsx`
- L35: `rounded-t-xl` → `rounded-t-lg` — off-scale radius
- L44: `rounded-l-xl` → `rounded-s-lg` — physical side → logical; off-scale radius
- L45: `rounded-tl-xl` → `rounded-ss-lg` — physical side → logical; off-scale radius
- L46: `rounded-r-none` → `rounded-e-none` — physical side → logical
- L58: `rounded-t-xl` → `rounded-t-lg` — off-scale radius

#### `shared/ui/destructive-confirmation-dialog.tsx`
- L38: `text-[13px]` → `text-title` — dialog title
- L41: `text-[13px]` → `text-ui`
- L54: `rounded-full` → `rounded-md` — control; `shadow-sm` → — (remove) — flat surfaces; hairline border instead

#### `shared/ui/glass-dialog.tsx`
- L13: `bg-black/40` → `bg-scrim`
- L15: `rounded-[26px]` → `rounded-lg` — off-scale radius; `sm:rounded-[26px]` → `sm:rounded-lg` — off-scale radius
- L16: `backdrop-blur-2xl` `backdrop-saturate-150` → — (remove) — no blur outside window chrome; use an opaque token surface
- L17: `shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_24px_70px_rgba(0,0,0,0.32)]` → — (remove) — flat surfaces; hairline border instead
- L35: `rounded-full` → `rounded-md` — control; `shadow-[0_1px_2px_rgba(0,0,0,0.06)]` → — (remove) — button: flat

#### `shared/ui/shortcut-hint.tsx`
- L22: `text-[10px]` → — (remove) — Kbd default is 10.5px; drop the override

### sidebar/

#### `sidebar/custom-sidebar-header.tsx`
- L103: `rounded-full` → `rounded-md` — icon button

#### `sidebar/folder-name-dialog.tsx`
- L82: `text-[13px]` → `text-title` — dialog title
- L117: `rounded-full` → `rounded-md` — control; `shadow-sm` → — (remove) — flat surfaces; hairline border instead

#### `sidebar/note-filter-menu.tsx`
- L46: `rounded-full` → `rounded-md` — icon button

#### `sidebar/settings.tsx`
- L60: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L108: `text-[11px]` → `text-caption`

#### `sidebar/timeline/chips.tsx`
- L21: `shadow-md` → keep shadow-md — floating over scrolling content
- L49: `rounded-full` → keep rounded-full — floating jump chip (coach scroll-to-bottom pattern); `shadow-xs` → `shadow-md` — floating chip level
- L103: `rounded-full` → keep rounded-full — floating jump chip (coach scroll-to-bottom pattern); `shadow-md` → keep shadow-md — floating over scrolling content
- L111: `text-yellow-400` → `text-warm-strong` — icon only

#### `sidebar/timeline/index.tsx`
- L507: `rounded-xl` → `rounded-lg` — off-scale radius
- L543: `from-background/0` `to-background` `bg-linear-to-b` → scroll-fade-y on the scroller — mask fade, not a painted gradient

#### `sidebar/timeline/realtime.tsx`
- L50: `rounded-full` → `rounded-sm` — badge/tag; `text-[11px]` → `text-caption`

#### `sidebar/toast/undo-delete-toast.tsx`
- L176: `rounded-b-xl` → `rounded-b-lg` — off-scale radius

### templates/

#### `templates/auto-form.tsx`
- L145: `hover:text-black` → `hover:text-foreground`
- L147: `text-emerald-600` → `text-success` — status colour: dot/icon only; `hover:text-emerald-700` → `hover:text-success` — status colour: dot/icon only; `dark:text-emerald-400` `dark:hover:text-emerald-300` → — (remove) — the token already themes dark
- L180: `rounded-full` → `rounded-md` — control
- L212: `text-lg` → `text-title`
- L236: `rounded-2xl` → `rounded-lg` — off-scale radius

#### `templates/auto-format-examples-dialog.tsx`
- L135: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

#### `templates/details.tsx`
- L147: `hover:text-black` → `hover:text-foreground`

#### `templates/sections-editor.tsx`
- L180: `rounded-full` → `rounded-md` — control; `shadow-[0_2px_6px_rgba(87,83,78,0.08),0_10px_18px_-10px_rgba(87,83,78,0.22)]` → — (remove) — not a floating layer
- L275: `text-red-600` → `text-destructive`; `focus:text-red-600` → `focus:text-destructive`
- L302: `rounded-xl` → `rounded-lg` — off-scale radius

#### `templates/template-form.tsx`
- L237: `hover:text-black` → `hover:text-foreground`
- L239: `text-emerald-600` → `text-success` — status colour: dot/icon only; `hover:text-emerald-700` → `hover:text-success` — status colour: dot/icon only; `dark:text-emerald-400` `dark:hover:text-emerald-300` → — (remove) — the token already themes dark
- L259: `text-rose-500` `hover:text-rose-600` → `text-foreground` — pinned = filled icon, not red
- L298: `text-red-600` → `text-destructive`; `focus:text-red-600` → `focus:text-destructive`

#### `templates/template-icon-picker.tsx`
- L279: `text-lg` → keep — emoji glyph size, not text
- L322: `rounded-full` → keep rounded-full — avatar/icon disc
- L331: `text-white` → keep — check on a colour swatch
- L339: `rounded-full` → keep rounded-full — colour wheel swatch (conic gradient allowed in a colour picker)
- L351: `rounded-full` → keep rounded-full — avatar/icon disc
- L465: `text-lg` → keep — emoji glyph size, not text

#### `templates/template-sidebar.tsx`
- L386: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L461: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L495: `rounded-lg` → `rounded-md` — control/row on 8px → 6px
- L569: `rounded-lg` → `rounded-md` — control/row on 8px → 6px

## 5. RTL and icons

**Physical → logical.** Rename `pl/pr/ml/mr/left/right/text-left/text-right/border-l/border-r` → `ps/pe/ms/me/start/end/text-start/text-end/border-s/border-e`. Centring with `left-1/2 -translate-x-1/2` is excluded. Negative margins (`-ml-*`) were not scanned, so grep them too.

- `sidebar/custom-sidebar-header.tsx`: L49 `pr-1`→`pe-1`, L55 `pl-2`→`ps-2`, L73 `ml-1`→`ms-1`
- `sidebar/index.tsx`: L55 `pr-1`→`pe-1`
- `sidebar/settings.tsx`: L124 `text-left`→`text-start`
- `sidebar/timeline/buckets.tsx`: L83 `pr-1`→`pe-1`, L83 `pl-3`→`ps-3`
- `sidebar/timeline/item.tsx`: L230 `text-left`→`text-start`, L231 `pl-4`→`ps-4`, L232 `pr-10`→`pe-10`, L254 `text-left`→`text-start`, L305 `left-1.5`→`start-1.5`, L309 `left-0`→`start-0`, L324 `right-3`→`end-3`
- `sidebar/timeline/realtime.tsx`: L45 `right-0`→`end-0`, L45 `left-0`→`start-0`
- `settings/general/index.tsx`: L276 `ml-3`→`ms-3`, L276 `border-l-2`→`border-s-2`, L276 `pl-4`→`ps-4`
- `settings/general/notification.tsx`: L271 `ml-3`→`ms-3`, L271 `border-l-2`→`border-s-2`, L271 `pl-4`→`ps-4`, L376 `ml-3`→`ms-3`, L376 `border-l-2`→`border-s-2`, L376 `pl-4`→`ps-4`, L501 `ml-0.5`→`ms-0.5`
- `settings/general/spoken-languages.tsx`: L144 `ml-0.5`→`ms-0.5`, L189 `right-0`→`end-0`, L189 `left-0`→`start-0`, L207 `text-left`→`text-start`
- `settings/general/storage/export-location.tsx`: L54 `text-left`→`text-start`
- `settings/appearance/theme.tsx`: L59 `text-left`→`text-start`
- `settings/claude/instructions.tsx`: L72 `ml-auto`→`ms-auto`
- `settings/todo/index.tsx`: L38 `text-left`→`text-start`
- `settings/dictionary/index.tsx`: L89 `pr-4`→`pe-4`, L89 `pl-4`→`ps-4`, L198 `pr-3`→`pe-3`, L198 `pl-4`→`ps-4`, L243 `pr-3`→`pe-3`, L243 `pl-4`→`ps-4`
- `settings/ai/shared/index.tsx`: L610 `pl-6`→`ps-6`, L617 `pl-6`→`ps-6`
- `settings/ai/shared/provider-search.tsx`: L34 `ml-auto`→`ms-auto`
- `settings/ai/stt/local-file-model.tsx`: L89 `text-left`→`text-start`, L92 `text-left`→`text-start`
- `settings/ai/stt/select.tsx`: L342 `text-left`→`text-start`, L858 `group-focus-within:pr-16`→`group-focus-within:pe-16`, L858 `group-hover:pr-16`→`group-hover:pe-16`, L888 `pr-20`→`pe-20`, L941 `right-1.5`→`end-1.5`, L1073 `right-0`→`end-0`, L1073 `pl-6`→`ps-6`
- `calendar/components/calendar-selection.tsx`: L220 `pr-2`→`pe-2`, L220 `pl-0`→`ps-0`, L220 `text-left`→`text-start`
- `calendar/components/calendar-view.tsx`: L230 `pr-3`→`pe-3`, L230 `pl-3`→`ps-3`, L297 `border-r-border`→`border-e-border`, L297 `border-r`→`border-e`, L344 `border-r-border`→`border-e-border`, L344 `border-r`→`border-e`
- `calendar/components/day-cell.tsx`: L98 `border-r-border`→`border-e-border`, L98 `border-r`→`border-e`, L144 `pl-1`→`ps-1`, L144 `text-left`→`text-start`
- `calendar/components/event-chip.tsx`: L111 `text-left`→`text-start`, L122 `pl-0.5`→`ps-0.5`, L122 `text-left`→`text-start`, L133 `ml-auto`→`ms-auto`, L454 `text-left`→`text-start`
- `calendar/components/session-chip.tsx`: L87 `pl-0.5`→`ps-0.5`, L87 `text-left`→`text-start`, L95 `ml-auto`→`ms-auto`
- `calendar/components/sidebar.tsx`: L167 `text-left`→`text-start`
- `devtools-bar/index.tsx`: L166 `pl-2.5`→`ps-2.5`, L208 `pr-2.5`→`pe-2.5`, L449 `pr-3`→`pe-3`, L452 `text-right`→`text-end`
- `devtools-bar/scan-panel-layout.ts`: L185 `right-0`→`end-0`, L186 `left-0`→`start-0`, L187 `left-0`→`start-0`, L188 `right-0`→`end-0`, L189 `left-0`→`start-0`, L190 `right-0`→`end-0`
- `devtools-bar/scan-panel.tsx`: L73 `border-r`→`border-e`, L77 `pr-3`→`pe-3`, L77 `pl-6`→`ps-6`, L105 `text-left`→`text-start`, L149 `pr-6`→`pe-6`, L149 `pl-3`→`ps-3`, L255 `ml-auto`→`ms-auto`, L295 `right-2`→`end-2`, L346 `ml-auto`→`ms-auto`, L403 `left-0`→`start-0`, L504 `text-right`→`text-end`
- `audio-player/timeline.tsx`: L146 `text-left`→`text-start`
- `changelog/index.tsx`: L36 `pr-1`→`pe-1`, L36 `pl-3`→`ps-3`, L129 `pl-[80px]`→`ps-[80px]`, L137 `right-[70px]`→`end-[70px]`, L137 `left-0`→`start-0`, L140 `right-[70px]`→`end-[70px]`, L143 `left-[28px]`→`start-[28px]`, L152 `text-left`→`text-start`, L160 `ml-auto`→`ms-auto`, L160 `pr-1`→`pe-1`
- `contacts/contact-page-header.tsx`: L46 `pr-1`→`pe-1`, L46 `pl-3`→`ps-3`
- `contacts/details.tsx`: L441 `pl-5`→`ps-5`, L753 `ml-2`→`ms-2`, L877 `text-left`→`text-start`, L883 `mr-2`→`me-2`, L894 `text-left`→`text-start`, L902 `mr-2`→`me-2`, L923 `text-left`→`text-start`, L929 `mr-2`→`me-2`
- `contacts/organization-item.tsx`: L63 `text-left`→`text-start`
- `contacts/person-item.tsx`: L69 `text-left`→`text-start`
- `contacts/related-notes.tsx`: L76 `ml-auto`→`ms-auto`, L109 `text-left`→`text-start`
- `editor-bridge/app-link-view.tsx`: L317 `text-left`→`text-start`
- `shared/connect-button-group.tsx`: L34 `left-0`→`start-0`
- `shared/control.tsx`: L96 `mr-1.5`→`me-1.5`, L167 `mr-1.5`→`me-1.5`
- `shared/long-load-gate.tsx`: L138 `mr-1.5`→`me-1.5`
- `shared/open-note-dialog.tsx`: L361 `right-0`→`end-0`, L361 `left-0`→`start-0`, L500 `text-left`→`text-start`
- `shared/ui/resource-list/preview-header.tsx`: L47 `mr-2`→`me-2`, L57 `pr-1`→`pe-1`, L57 `pl-3`→`ps-3`
- `shared/hooks/useWindowControlsGutter.ts`: L11 `pl-[calc`→`ps-[calc`, L13 `left-[calc`→`start-[calc`, L15 `pl-[calc`→`ps-[calc`, L17 `pl-[calc`→`ps-[calc`
- `shared/main/shell-scaffold.tsx`: L33 `pl-1`→`ps-1`, L53 `border-r-0`→`border-e-0`, L54 `border-l`→`border-s`
- `task/resource-view.tsx`: L100 `ml-2`→`ms-2`
- `task/tab-content.tsx`: L117 `text-left`→`text-start`
- `templates/auto-form.tsx`: L134 `pr-1`→`pe-1`, L134 `pl-3`→`ps-3`
- `templates/auto-format-examples-dialog.tsx`: L122 `pr-12`→`pe-12`, L203 `ml-auto`→`ms-auto`
- `templates/sections-editor.tsx`: L184 `mr-2`→`me-2`, L232 `right-2`→`end-2`, L285 `pr-9`→`pe-9`
- `templates/template-form.tsx`: L85 `ml-0.5`→`ms-0.5`, L198 `pr-1`→`pe-1`, L198 `pl-3`→`ps-3`
- `templates/template-icon-picker.tsx`: L269 `after:right-0`→`after:end-0`, L269 `after:border-l-transparent`→`after:border-s-transparent`, L305 `after:right-0`→`after:end-0`, L305 `after:left-0`→`after:start-0`
- `templates/template-sidebar.tsx`: L461 `text-left`→`text-start`, L495 `text-left`→`text-start`, L569 `text-left`→`text-start`
- `folders/folder-editor.tsx`: L101 `pr-1`→`pe-1`, L101 `pl-3`→`ps-3`, L249 `right-1.5`→`end-1.5`
- `folders/sidebar.tsx`: L138 `text-left`→`text-start`
- `main/body.tsx`: L409 `pr-1`→`pe-1`, L415 `pl-2`→`ps-2`, L447 `left-1`→`start-1`, L453 `pr-1`→`pe-1`, L459 `pl-2`→`ps-2`, L479 `left-0`→`start-0`, L489 `pl-2`→`ps-2`
- `main/sidebar-timeline-chrome.tsx`: L164 `right-1`→`end-1`
- `main/windows-title-bar.tsx`: L82 `pl-2`→`ps-2`, L121 `ml-2`→`ms-2`
- `main/windows-window-controls.tsx`: L74 `left-0`→`start-0`, L75 `left-0`→`start-0`, L119 `right-0`→`end-0`, L120 `left-0`→`start-0`
- `onboarding/index.tsx`: L164 `pr-3`→`pe-3`, L164 `pl-12`→`ps-12`
- `onboarding/permissions.tsx`: L66 `text-left`→`text-start`
- `session/index.tsx`: L289 `pr-3`→`pe-3`, L289 `pl-1`→`ps-1`
- `session/components/folder-picker.tsx`: L204 `text-left`→`text-start`
- `session/components/outer-header/index.tsx`: L80 `pl-2`→`ps-2`, L81 `pl-2`→`ps-2`, L85 `pl-[32px]`→`ps-[32px]`, L107 `pr-1`→`pe-1`, L279 `mr-1`→`me-1`, L279 `ml-1`→`ms-1`, L290 `pr-2.5`→`pe-2.5`, L290 `pl-1.5`→`ps-1.5`, L308 `border-l`→`border-s`
- `session/components/outer-header/overflow/always-on-top.tsx`: L48 `ml-auto`→`ms-auto`
- `session/components/outer-header/metadata/participants/chip.tsx`: L97 `ml-0.5`→`ms-0.5`, L129 `ml-0.5`→`ms-0.5`
- `session/components/outer-header/metadata/participants/dropdown.tsx`: L63 `text-left`→`text-start`
- `session/components/note-input/create-brief-suggestion.tsx`: L16 `text-left`→`text-start`
- `session/components/note-input/raw.tsx`: L465 `text-left`→`text-start`, L501 `text-left`→`text-start`
- `session/components/note-input/template-picker.tsx`: L601 `text-left`→`text-start`
- `session/components/note-input/transcript/renderer/index.tsx`: L529 `right-1`→`end-1`
- `session/components/note-input/transcript/renderer/selection-menu.tsx`: L60 `text-left`→`text-start`, L168 `pl-3`→`ps-3`
- `session/components/note-input/transcript/renderer/speaker-assign.tsx`: L575 `text-left`→`text-start`, L585 `pl-2`→`ps-2`, L638 `text-left`→`text-start`
- `session/components/note-input/enhanced/streaming.tsx`: L73 `pl-4`→`ps-4`, L76 `border-l`→`border-s`
- `packages/ui/src/components/ui/accordion.tsx`: L31 `text-left`→`text-start`
- `packages/ui/src/components/ui/app-toast.tsx`: L308 `pr-[max`→`pe-[max`, L569 `text-left`→`text-start`, L677 `text-left`→`text-start`
- `packages/ui/src/components/ui/button-group.tsx`: L13 `border-l-0`→`border-s-0`
- `packages/ui/src/components/ui/carousel.tsx`: L188 `pl-4`→`ps-4`
- `packages/ui/src/components/ui/command.tsx`: L43 `mr-2`→`me-2`, L138 `ml-auto`→`ms-auto`
- `packages/ui/src/components/ui/dialog.tsx`: L61 `left-[50`→`start-[50`, L67 `right-4`→`end-4`, L83 `sm:text-left`→`sm:text-start`
- `packages/ui/src/components/ui/dropdown-menu.tsx`: L33 `pl-8`→`ps-8`, L39 `ml-auto`→`ms-auto`, L100 `pl-8`→`ps-8`, L115 `pr-2`→`pe-2`, L115 `pl-8`→`ps-8`, L122 `left-2`→`start-2`, L140 `pr-2`→`pe-2`, L140 `pl-8`→`ps-8`, L146 `left-2`→`start-2`, L169 `pl-8`→`ps-8`, L195 `ml-auto`→`ms-auto`
- `packages/ui/src/components/ui/input-group.tsx`: L19 `pl-2`→`ps-2`, L20 `pr-2`→`pe-2`, L40 `pl-3`→`ps-3`, L40 `ml-[-0.45rem]`→`ms-[-0.45rem]`, L40 `ml-[-0.35rem]`→`ms-[-0.35rem]`, L42 `pr-3`→`pe-3`, L42 `mr-[-0.4rem]`→`me-[-0.4rem]`, L42 `mr-[-0.35rem]`→`me-[-0.35rem]`
- `packages/ui/src/components/ui/resizable.tsx`: L39 `after:left-0`→`after:start-0`
- `packages/ui/src/components/ui/select.tsx`: L128 `pr-8`→`pe-8`, L128 `pl-2`→`ps-2`, L134 `right-2`→`end-2`
- `packages/ui/src/components/ui/spinner.tsx`: L32 `left-0`→`start-0`

**Icons.** Off-scale `size={13|15|17|9|10|20}` → `size={12|14|16}`, and `weight="bold"` → regular (stroke 1.5) unless it's a check glyph of 12px or less.

- `sidebar/note-filter-menu.tsx`: L53 `size={15}`
- `sidebar/settings.tsx`: L132 `size={15}`
- `sidebar/timeline/chips.tsx`: L23 `weight="bold"`, L111 `size={13}`
- `sidebar/timeline/item.tsx`: L346 `size={10}`
- `settings/appearance/theme.tsx`: L86 `weight="bold"`
- `calendar/components/calendar-selection.tsx`: L234 `weight="bold"`
- `contacts/person-item.tsx`: L94 `weight="bold"`
- `contacts/related-notes.tsx`: L51 `size={15}`
- `editor-bridge/app-link-view.tsx`: L261 `weight="bold"`
- `templates/auto-form.tsx`: L164 `weight="bold"`
- `templates/template-form.tsx`: L245 `weight="bold"`
- `main/sidebar-timeline-chrome.tsx`: L115 `size={15}`, L122 `size={15}`
- `onboarding/shared.tsx`: L68 `weight="bold"`
- `session/components/note-input/transcript/renderer/segment-header.tsx`: L38 `weight="bold"`
## 6. Brand assets

- `apps/desktop/src-tauri/icons/src/cue-{stable,dev,staging}{,-small}.svg` (6 files) all share the same tile:
  - L3–6: the `linearGradient#tile` fill `#2c2c2c → #121212` produces the banded vertical tile. Replace it with a flat `fill="#1c1c1c"` on L16, and delete L3–6.
  - L7–11 and L17: the `linearGradient#edge` stroke (white .14 → .04 → .02) becomes a flat `stroke="#fff" stroke-opacity=".08"`. Delete L7–11.
  - L12–14: keep `feDropShadow`, because the macOS icon grid draws its own drop shadow and this matches it. **Owner call:** remove it if the tile should be completely flat.

  Then regenerate the bundle sets the same way 261046de did (`tauri icon`, plus `iconutil` for the icns). That covers `apps/desktop/public/assets/app-icons/*.png`, `src-tauri/icons/{stable,dev,staging}/*` and `src-tauri/resources/*/AppIcon.icns`.
- `apps/desktop/src/shared/brand-loading-view.tsx`:
  - L19–20: remove `drop-shadow-[…]` and `dark:drop-shadow-[…]`; the mark is flat.
  - L29–30: the `mask-image` shimmer sweep is a mask, so it's allowed. Under reduced motion it stops (global kill switch).
- `apps/desktop/index.html` L59–70: the splash uses a `mask-image` gradient. It's a mask, so it's allowed.

## 7. Screenshot plan (before and after, light and dark)

Capture each item twice per theme, at a 1280×800 window with system text size at its default. Switch themes with Settings → General (app) → Appearance → Theme, or with macOS Appearance when the theme is set to System. Use the dev build (`pnpm -F desktop tauri dev` or the existing dev app) so that the devtools bar is available. Each item lists what to look for.

| # | Screen | How to reach | Check |
|---|---|---|---|
| 1 | Main window, sidebar timeline | Launch, then Home. Have one note recording (⌘N, start listening) and one upcoming calendar event | row radius 6, recording `bg-live` dot, jump chip, group labels, bottom fade |
| 2 | Note: header and tabs | Open any note | segmented tabs, title `text-page-title`, header buttons `rounded-md`, no shadows |
| 3 | Note: overflow menu, then Export modal and Delete | Header ⋯; then Export…; then Delete | menu container 8 / items 6, `shadow-lg`; export dialog `rounded-lg shadow-2xl`, scrim; destructive item |
| 4 | Note: metadata popover, date picker, participants | Click the date/participants in the header | popover, icon buttons, red/green hover gone |
| 5 | Transcript: selection menu, speaker assign | Transcript tab; select words; click a speaker name | floating toolbar radius, speaker popover |
| 6 | Template picker | Note → Summary → template button | popover radius (was 20), favourite colour |
| 7 | In-note search | ⌘F in a note | `h-7 rounded-md` fields, counter `text-caption tabular-nums` |
| 8 | Quick open | ⌘K | palette `rounded-lg shadow-2xl`, top-aligned, kbd |
| 9 | Settings → General / Notifications / Meetings | ⌘, | switches (on and off contrast), inputs (border 3:1), tag input, spoken-languages dropdown, 15px section headings |
| 10 | Settings → Storage → legacy cleanup | General → Storage → Clean up | glass dialog → standard dialog |
| 11 | Settings → App: theme and app icon | ⌘, → App | theme cards (`rounded-lg`), preview using tokens, icon tiles |
| 12 | Settings → Transcription | ⌘, → Transcription | model rows, badges (was gradient chips), local model row, warning icon |
| 13 | Settings → Dictionary / Claude / Permissions / Folders | ⌘, → each tab | empty states, cards (`rounded-2xl` → 8), primary button (was `bg-black`) |
| 14 | Contacts: person and organization | Sidebar → Contacts → a person; an org | inline fields `text-body`, avatar circle, org picker popover, list rows |
| 15 | Calendar | Sidebar → Calendar (month) | day disc, event chip popover, calendar list rows, Apple permission dialog (revoke access first) |
| 16 | Templates | Sidebar → Templates → one template; icon picker | sidebar rows, form, swatches, auto-format examples dialog |
| 17 | Folders | Sidebar → Folders → a folder → edit | cover card, remove button, folder materials |
| 18 | Toasts | Delete a note (undo toast); trigger any app toast | `rounded-lg shadow-lg`, gauge bar |
| 19 | Onboarding | Reset onboarding (devtools ⋯ → onboarding) | welcome hero (blur/gradient veils), permissions rows, calendar step, primary buttons |
| 20 | Devtools bar | Dev build: collapsed strip, expanded bar, scan panel, hint | tokens in `.dark` scope, channel dot |
| 21 | Lock, long-load and error screens; version history; conflict banner; changelog; task view | Lock via the app lock setting; version history from the note ⋯; the banner by editing one note in two windows; changelog from About; a task resource link | icon discs, `text-title`, banner card, page titles |
| 22 | RTL pass | Set the app language to Arabic; repeat 1, 2, 5, 9 and 14 | logical paddings, chevrons, mask fades |

Keep the before shots under `docs/design/screens/before/<#>-<light|dark>.png` and the after shots under `after/`, so they can be compared side by side.
