# Cue design spec

The coach panel (`apps/coach/src/ui`) is the reference. The meeting island (`plugins/windows/swift-lib/src/FloatingBarView.swift`) is a second, native reference for motion, the live dot and contrast. Every value here comes from one of those two, with its source cited. Rules marked **(ext)** are extrapolated in the coach's spirit for patterns the coach doesn't have, and the owner should review them. Exact fixes are listed in `cue-audit.md`.

## 1. Corners

| Step | Class | Use | Source |
|---|---|---|---|
| 4px | `rounded-sm` | kbd, checkbox, inline code, badges, favicons, segmented items, skeleton bars | coach `rounded-[4px]` kbd/checkbox, `rounded-sm` code |
| 6px | `rounded-md` | buttons, icon buttons, inputs, selects, rows, menu items, tooltips, notices | coach `Button`, `IconButton` ghost, palette option, tooltip |
| 8px | `rounded-lg` | cards, menus, popovers, dialogs, palette, toasts, composer, chat bubbles | coach wrap-up card, composer, palette, menu, user bubble |
| 12px | `rounded-xl` | window-level surfaces only (main window inset, chat dock) | `--radius-xl` in coach |
| full | `rounded-full` | dots, avatars, switch track and thumb, radio, progress/level bars, suggestion/filter chips, round primary icon buttons (send, play) and round floating buttons | coach dots, chips (`composer.tsx:101`), send button, scroll-to-bottom |

- Nothing else is allowed: no `rounded`, `rounded-xs`, `rounded-2xl`, `rounded-3xl`, `rounded-pill`, or arbitrary `rounded-[Npx]`. Sides use logical names: `rounded-s-*`, `rounded-e-*`, `rounded-ss-*` and so on, never `l`/`r`/`tl`/`br`.
- **Nesting:** inner radius = outer radius − inset, rounded to a step, and never larger than the outer radius. Choose the inset that lands on a step: 6 with a 2px inset gives 4 (segmented control `p-0.5`); 8 with 2px gives 6; 12 with 4px gives 8. Menus are an accepted exception: an 8px menu with `p-1` keeps `rounded-md` items (coach composer menu). Once padding is equal to or larger than the outer radius, the child uses its own role radius.
- Delete these hacks: the `.rounded-full { border-radius: var(--radius) }` and `--radius-full: var(--radius)` overrides in `apps/desktop/src/styles/globals.css`, the shifted radius `@theme` in `packages/ui/src/styles/globals.css`, and the Lisse `useSquircleRef` clip-paths. Those clip-paths force 8px or 20px on Button, Badge, Select, Avatar, toasts and floating panels, and they clip focus outlines. `corner-shape: squircle` can stay as progressive enhancement, but the radii must look right as plain arcs because WKWebView may ignore it.

## 2. Type

Font: `Inter`, then `IBM Plex Sans Arabic`, then `system-ui`. Only weights 400, 500 and 600 are allowed, so drop the 700 import and `font-bold`. Set `font-feature-settings: "cv11","ss01"` and `-webkit-font-smoothing: antialiased` on `body` (coach `styles.css`). Inter is loaded as static cuts with no optical-size axis, so sizes of 20px and above get `-0.01em` tracking instead. Use `tabular-nums` on every timer, duration, count, timestamp and size (coach header elapsed time, island `monospacedDigit()`).

Add these to `@theme` as `--text-<role>` with `--line-height` and, where needed, `--font-weight` and `--letter-spacing`:

| Role | Class | Size/line | Weight | Use | Coach source |
|---|---|---|---|---|---|
| caption | `text-caption` | 11.5/16 | 400 (500 for labels on fills) | tooltip, hints, timestamps, row footers, dividers | tooltip, palette hint, `TurnFooter` |
| label | `text-label` | 12/16 | 400; 500 for group headings | subtitles, group labels, chips, secondary line of two-line rows | header subtitle, wrap-up `h3`, chips |
| ui | `text-ui` | 13/18 | 400; 500 on buttons | buttons, menu and list items, notices, dialog body | `Button` md, palette item, notices |
| body-strong | `text-strong` | 13.5/20 | 600 titles, 500 emphasis | panel and header titles, card and list item titles | header title, error title, wrap-up items |
| body | `text-body` | 14/21 | 400 | inputs, composer, messages, paragraphs (`leading-[1.6]` for long reading) | composer, user bubble, markdown |
| title | `text-title` | 15/22 | 600 | dialog titles, settings section headings, empty-state heading | timeline `h2`; owner's 15px section headings |
| page-title | `text-page-title` | 20/28, −0.01em | 600 | page and note titles **(ext)** | none |

- Kbd uses `text-[10.5px] leading-[1.5] font-medium tabular-nums` inside the `Kbd` component only. An overline is `text-caption font-medium uppercase tracking-wide`, and only for group labels in menus.
- Body text is `text-body` and the small label `text-label`; `text-sm` and `text-xs` are gone (the guard flags them). Every other size is a violation too: `text-[Npx]`, `text-base`, `text-lg` and up. Coach's `12.5px` merges into `text-ui` (13).
- Editor prose (`packages/editor`) is outside this UI scale.

**Text colours.** Contrast is computed from the oklch tokens with these proposed values. Light is measured on `--background` 0.98 and `--sidebar`/`--muted` 0.94; dark on `--background` 0.20, `--card` 0.22, `--muted` 0.24 and `--accent` 0.28.

| Role | Class | Light | Dark |
|---|---|---|---|
| primary | `text-foreground` | 19.8 : 1 / 17.6 | 15.6 / 12.6 |
| secondary | `text-muted-foreground` | 7.0 / 6.2 | 5.8 / 4.7 |
| tertiary, placeholder | `text-tertiary-foreground` **(new)** | 5.2 / 4.6 | 5.0 / 4.5 |
| disabled | `opacity-40` on the control (coach) | exempt (WCAG 1.4.3) | exempt |
| on primary fill | `text-primary-foreground` | 19.8 | 15.5 |
| on amber fill | `text-warm-foreground` (0.98 becomes 0.2) | 8.0 (was 2.1) | 6.6 (was 2.6) |
| destructive | `text-destructive` (L 0.56→0.53; D 0.64→0.68) | 5.5 / 4.9 (was 4.3) | 5.8 / 4.7 (was 4.0) |
| on destructive fill | `text-destructive-foreground` (dark 0.98 becomes 0.15) | 5.5 | 6.3 (was 3.5) |

- Never use the coach's `text-muted-foreground/80` or `/70`: they measure 4.3 and 3.4 in light. Use `text-tertiary-foreground`.
- Amber is never used for text: `--warm` is 2.1 : 1 on light backgrounds.
- Speaker colours `--speaker-1..6` go only on `--background`: 4.6 there, 4.0 on the sidebar.

**UI parts need 3 : 1.**

| Part | Value | Contrast |
|---|---|---|
| field, checkbox and radio borders | `border-input` (L 0.86→0.62, D 0.36→0.52) | L 3.4 (was 1.4), D 3.3 / 3.1 |
| focus outline | `outline-warm-strong` (`--warm-strong` L 0.6 0.13 65, D 0.78 0.12 72, both coach values) | L 3.9 / 3.4, D 8.9 |
| switch, off | `bg-foreground/45` | 3.3 |
| switch, on | `bg-warm-strong`; dark `bg-warm` | 3.9 / 6.6 |
| live dot | `bg-live` (coach `--live`) | 3.8 / 5.3 |

`--border` hairlines are decorative and exempt: 1.4 light, 1.2 dark. Fills used for selected and hover rows are only 1.1–1.2 : 1, so a selected row also gets `font-medium text-foreground`.

**Truncation:** single-line text is `min-w-0 truncate` plus `title={full}` (coach header). Names use `line-clamp-2 [overflow-wrap:anywhere]` (coach `dt`). Buttons and chips are `whitespace-nowrap shrink-0` and never truncate. Empty-state copy uses `text-balance`.

**RTL:** the UI language sets `dir` on `<html>` and a Radix `DirectionProvider` (`AppI18nProvider`); Arabic, Hebrew, Persian, Urdu, Pashto, Sindhi and Yiddish lay out right to left. The pane layout keeps its places (sidebar beside the macOS traffic lights, which never mirror for an app-level language); pane contents follow the app direction, and window chrome next to the traffic lights keeps physical offsets. Put `dir="auto"` on every node that shows user, transcript or model text, and use `<bdi>` inside mixed lines (times, labels; coach). Single-line titles in lists are `max-w-full self-start truncate [unicode-bidi:plaintext]`: they sit at the list's start and truncate at their own end (WebKit and Chromium resolve `match-parent` against the element, not the parent, under `plaintext`). Markdown uses `unicode-bidi: plaintext`. Shortcuts always read left to right (`Kbd` and `KbdGroup` carry `dir="ltr"`). Use logical utilities only: `ps-/pe-/ms-/me-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e`. Chevrons that point inline get `rtl:rotate-*`, and edge fades flip with `:dir(rtl)` (coach `.coach-fade-x`).

## 3. Surfaces and elevation

- Default surfaces are flat with a hairline: `border border-border`. Cards are `rounded-lg border border-border bg-background` (coach wrap-up uses `bg-surface`, the page colour). Use `bg-card` only to raise content off a `bg-muted` area. Wells and code blocks are `rounded-md border border-border bg-background` on a raised surface (coach steps).
- Three shadows exist, and only on floating layers:

| Class | Layer | Coach source |
|---|---|---|
| `shadow-md` | round floating button or jump chip over scrolling content | scroll-to-bottom button |
| `shadow-lg` | tooltip, menu, popover, select, toast, floating toolbar | tooltip, composer menu |
| `shadow-2xl` | dialog, command palette | palette |

  The switch thumb may use `shadow-sm` **(ext)**. Nothing else gets a shadow: no shadows on cards, buttons, inputs, kbd or rows, and no `shadow-[...]`.
- Scrim: `bg-scrim`, with `--scrim` set to `oklch(0 0 0 / .25)` light and `/ .45` dark. This matches coach `bg-black/25 dark:bg-black/45`. Replace `bg-black/80`.
- No `backdrop-blur`, `blur-*` or `backdrop-saturate`. Native window material (the island's `.ultraThickMaterial`) is the only blur.
- No painted gradients: no `bg-linear-*`, `from-/via-/to-` or shimmer sweeps. Edge fades are masks and are allowed: `scroll-fade-y`, `.coach-fade-y`, `mask-image`.
- The app icon tile is flat. `apps/desktop/src-tauri/icons/src/cue-*.svg` currently fill the tile with `linearGradient#tile` (`#2c2c2c`→`#121212`) and stroke it with `#edge`. Use one fill (`#1c1c1c`) and a 2px flat `#fff` stroke at `.08` instead.

## 4. Colour

- Greys come only from tokens: `foreground`, `muted-foreground`, `tertiary-foreground`, `background`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `sidebar*`. Hover and selected fills go one step darker than their surface: `bg-muted` on background, `bg-sidebar-accent` on the sidebar.
- **Amber** (`--warm`, `--warm-strong`, `--warm-glow`) is the only accent. It may appear in:
  - coach marks (`border-s-2 border-warm`)
  - the coach entry icon (island lightbulb)
  - warning icons (island triangle)
  - the focus outline
  - the switch on-state
  - `::selection` (`bg-warm-glow`)
  - search matches (`bg-warm/30`, with the active one `bg-warm text-warm-foreground`)
  - the caret (`caret-warm-strong`)

  It is never a button fill, never text, and never a large area.
- **Red:** `bg-live` is the recording dot only. `destructive` is for Stop, delete actions, error text and error cards. Red is never used for unread, pinned, favourites or decoration.
- **Status:** `success`, `warm` and `destructive` appear only as `size-1.5`/`size-2` dots or `size-3.5`/`size-4` icons. The one tinted fill is the coach error card, `border-destructive/30 bg-destructive/[0.06]`.
- No raw palette classes (`red-500`, `neutral-700`, `white`, `black`, `#hex`). The only exceptions are the switch thumb `bg-white`, `text-white` on `bg-scrim` over media, OS-native window controls, colour swatches, and the macOS traffic lights in the theme preview. Render theme previews inside a `.dark` or light scope using tokens.
- `--selection-overlay` blue becomes `var(--warm-glow)`. ProseMirror search colours (`dark-theme.css`) become `warm` tokens.

## 5. Spacing and density

- Use a 4px grid. Half steps of `0.5`, `1.5` and `2.5` are allowed (coach uses them).
- Paddings: headers `px-3`, panel content `px-4`, cards `px-3 pt-2.5 pb-3`, menus `p-1`, dialogs `p-4`.
- Control heights:
  - `h-6` (24): inline and row-footer actions (coach `TurnFooter`)
  - `h-7` (28): default buttons, icon buttons `size-7`, rows, menu items, segmented controls
  - `h-8` (32): dialog and form buttons, inputs, search fields
  - `h-11` (44): headers and palette input

  Don't use `h-9`, `h-10` or `h-12` for controls. Hit targets are at least 24×24 (WCAG 2.5.8); prefer 28.
- Rows: one line is `h-7 px-2`. Two lines are `py-1.5`, with a `text-ui` title over a `text-label text-muted-foreground` line (coach composer menu). Header rows are `h-11`, and the coach transcript strip is `h-9`.
- Icons are Hugeicons at stroke 1.5. Drop `weight="bold"`, except check glyphs of 12px or smaller.

  | Size | Use |
  |---|---|
  | `size-3` (12) | chips, caption rows |
  | `size-3.5` (14) | default in `h-6`/`h-7` controls and rows (coach, 19 uses) |
  | `size-4` (16) | `h-8` controls, headers, palette search |
  | `size-4.5` (18) | window toolbar only **(ext)** |

  Icons are `text-muted-foreground` at rest and `text-foreground` on hover or when selected. The icon-to-text gap is `gap-1.5`, or `gap-1` next to caption and label text.

## 6. Components

Buttons are copied from coach `primitives.tsx:52`. The base is `inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none transition-[background-color,color,opacity] duration-100 [&>svg]:shrink-0`. Sizes are sm `h-7 px-2.5 text-ui` and md `h-8 px-3 text-ui`.

| Variant | Classes |
|---|---|
| primary | `bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 disabled:opacity-40` |
| secondary (coach "outline") | `border border-border bg-background text-foreground hover:bg-muted active:bg-accent disabled:opacity-50` |
| ghost | `text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent disabled:opacity-40` |
| destructive (coach "danger"; island Stop) | `border border-destructive/40 text-destructive hover:bg-destructive/10`. A filled form, `bg-destructive text-destructive-foreground`, is only for the final confirm in a destructive dialog. |
| icon | `size-7 rounded-md` plus the ghost classes, always wrapped in a Tooltip (label + shortcut). The round form `size-7 rounded-full bg-primary text-primary-foreground` is only for send and play. |

- **Focus:** one global rule, `:focus-visible { outline: 2px solid var(--warm-strong); outline-offset: 2px; border-radius: var(--radius-sm) }` (coach `styles.css`, exactly; elements with their own radius keep it). Delete the per-component `focus-visible:ring-*` classes. Text fields use `focus-visible:outline-none focus:border-foreground` instead (coach composer border cue).
- **Inputs (ext):** `fieldClassName`: `h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-body placeholder:text-tertiary-foreground focus:border-foreground caret-warm-strong`. Fields are transparent so they never read as a grey fill on the card surface. Search boxes use `searchFieldClassName` (icon plus bare input, `text-ui`); select-like triggers use `selectTriggerClassName`. Text areas and composers use `rounded-lg px-3 pt-2.5 text-body leading-[1.5]`. No shadow, and no `dark:bg-muted/60`.
- **Switch (ext):** track `inline-flex h-5 w-9 rounded-full p-0.5` with `data-[state=unchecked]:bg-foreground/45 data-[state=checked]:bg-warm-strong dark:data-[state=checked]:bg-warm`. Thumb `size-4 rounded-full bg-white shadow-sm data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4`, animated over 150ms.
- **Checkbox and radio:** `size-3.5 border border-input`; the checkbox is `rounded-sm`, the radio `rounded-full` (`Radio`, a native input with a `size-1.5` dot). When checked: `border-primary bg-primary text-primary-foreground` (coach question panel).
- **Menu, select and popover:** container `rounded-lg border border-border bg-popover p-1 shadow-lg`. Items:
  - item: `flex h-7 items-center gap-2 rounded-md px-2 text-ui data-[highlighted]:bg-muted`, with the icon `size-3.5 text-muted-foreground` and the shortcut as `ms-auto <Kbd>`
  - destructive item: `text-destructive data-[highlighted]:bg-destructive/10`
  - group label: `px-2 pt-1.5 pb-1 text-label font-medium text-muted-foreground`
  - separator: `-mx-1 my-1 h-px bg-border`

  A popover with content (not a list) uses `p-3`. Remove the two-layer chrome-plus-panel `variant="app"` (22, 20 and 14px radii) entirely.
- **Dialog (ext, from the palette):** scrim `bg-scrim`. Panel `w-full max-w-[420px] rounded-lg border border-border bg-background shadow-2xl`.
  - title: `text-title`
  - description: `mt-1 text-ui text-muted-foreground`
  - footer: `flex justify-end gap-2 pt-3`, md buttons, primary last
  - padding: `p-4`
  - closes on Esc; no corner ✕ when the footer has Cancel
  - the command palette is top-aligned, with `pt-14`, `h-11` input and `text-body`
- **Tooltip** (coach `primitives.tsx:159`): `rounded-md bg-primary px-2 py-1 text-caption font-medium text-primary-foreground shadow-lg`. The shortcut is shown as `text-primary-foreground/60`. Offset 6px, 500ms open delay, 100ms fade.
- **Tabs and segmented control (ext):** track `inline-flex h-7 rounded-md bg-muted p-0.5`. Item `h-6 rounded-sm px-2.5 text-ui font-medium text-muted-foreground hover:text-foreground`; selected `bg-background text-foreground ring-1 ring-border`.
- **List and sidebar rows:** `rowClassName` / `ListRow`: `flex h-7 items-center gap-2 rounded-md px-2 text-ui`. Hover is `ROW_HOVER` (`bg-foreground/[0.04]`), selected is `ROW_SELECTED` (`bg-foreground/[0.08] font-medium text-foreground`): foreground washes, so selected reads clearly stronger than hover on the page and on the sidebar, in both themes. Two-line rows (timeline, contacts) keep the same washes with `px-2.5 py-1.5`. The recording row shows a `size-1.5 rounded-full bg-live` dot.
- **Badge (ext):** `inline-flex h-5 items-center gap-1 rounded-sm border border-border px-1.5 text-label font-medium text-muted-foreground`, with an optional status dot. No coloured badges.
- **Chip** (coach `composer.tsx:101`): `rounded-full border border-border px-2.5 py-1 text-label text-muted-foreground hover:bg-muted hover:text-foreground`.
- **Kbd** (coach `primitives.tsx:35`): `min-w-[1.35em] rounded-sm border border-border bg-background px-1 text-center text-[10.5px] leading-[1.5] font-medium text-muted-foreground tabular-nums`. Show glyphs `⌘⇧⌥⌃⏎`, in the order ctrl, alt, shift, mod. No shadow.
- **Notice and error:** the inline notice is `rounded-md border border-border px-2.5 py-1.5 text-ui`. A status line is `flex gap-1.5 text-ui text-muted-foreground` with an `Info size-3.5` icon. The error card is `rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5`: title `text-strong font-medium`, body `text-ui text-muted-foreground`.
- **Empty state** (coach `timeline.tsx:474`): `m-auto flex max-w-[340px] flex-col items-center gap-3 py-8 text-center`. The heading is `text-title`, the copy `mt-1 text-ui text-balance text-muted-foreground`, and actions are chips. No illustrations or large icons.
- **Toast (ext):** `w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 shadow-lg`, placed bottom-end with a 16px inset. Title `text-ui font-medium`, body `text-label text-muted-foreground`, action sm button, and an optional status icon at `size-4`. It auto-dismisses with no visible countdown or progress bar; the timer pauses while the pointer is over it or focus is inside.
- **Avatar:** flat circle, initials in one of the six `--speaker-N` hues on that hue mixed 14% into the background (`in oklab`, so the hue holds). No gradients or dithering; a photo replaces both.
- **Header** (coach `header.tsx:113`): `flex h-11 items-center gap-2 border-b border-border px-3`. Title `<bdi dir="auto" class="truncate text-strong">`; the subtitle is `text-label text-muted-foreground tabular-nums`, baseline-aligned with `gap-1.5`.
- **Loading:** working text uses `.coach-sheen`. Placeholders use `.coach-skeleton` (`bg-muted rounded-sm`, opacity .55↔1 over 0.9s). Spinners only appear inside buttons, at `size-3.5`.
- **Live dot:** `size-2 rounded-full bg-live coach-live-dot`, a 2s ring pulse. The island breathes at 0.9s, 1→0.45.

## 7. Motion

| What | Value | Source |
|---|---|---|
| hover/press colour | `duration-100`, ease-out | coach `Button`; island 0.1s |
| borders, chevrons, reveals | `duration-150` | coach strip chevron, composer border |
| enter (menu, popover, toast, dialog, cards) | `.coach-enter`: 200ms `cubic-bezier(0.2,0,0,1)` (`--ease-standard`), opacity 0→1 and translate 4px→0. Replace Radix `zoom-in-95` and `slide-in-from-*`. | coach |
| exit | opacity only, 100ms ease-in | island removal 0.1s |
| layout and size | spring `{ type:"spring", visualDuration:0.35, bounce:0.15 }` | island response .35, damping .85 |
| tooltip | 500ms delay, 100ms fade | coach |

- No scale-from-25, blur, wiggle or shimmer transitions.
- **Reduce motion:** keep the global kill switch in `globals.css`. Springs and translates become a 150ms opacity fade (island). Sheen, caret, skeleton, live pulse and enter animations stop (coach `@media (prefers-reduced-motion)`). The live dot stays solid.

## 8. Enforcement

`anlg/cue-design` (oxlint, `eslint-plugin-anlg.mjs` over `scripts/cue-design-classes.mjs`) runs as an error on `apps/desktop/src` and `packages/ui/src`. It flags raw palette colours, off-scale text sizes (including `text-sm`/`text-xs`), radii off the scale, shadows outside floating layers, blur, painted gradients, physical `l`/`r` utilities and per-element `focus:ring-*`. The few documented exceptions (switch thumb, Kbd size, app-icon mask, theme-preview traffic lights, the photo overlay glyph, emoji glyph size and swatch check, and window chrome beside the traffic lights) are listed in `ALLOWED` with the reason for each.
