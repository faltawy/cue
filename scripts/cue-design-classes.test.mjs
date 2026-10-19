import assert from "node:assert/strict";
import { test } from "node:test";

import { findViolations } from "./cue-design-classes.mjs";

const categories = (classes, file) =>
  findViolations(classes, file).map(
    ({ category, token }) => `${category} ${token}`,
  );

test("flags each off-scale class with its category, through variants", () => {
  assert.deepEqual(
    categories(
      "hover:bg-red-50 dark:text-white/90 text-[13px] text-lg shadow-xs backdrop-blur-xl bg-linear-to-b from-background rounded rounded-xs rounded-[22px] rounded-l-none rounded-tl-xl",
    ),
    [
      "palette hover:bg-red-50",
      "palette dark:text-white/90",
      "text-size text-[13px]",
      "text-size text-lg",
      "shadow shadow-xs",
      "blur backdrop-blur-xl",
      "gradient bg-linear-to-b",
      "gradient from-background",
      "radius rounded",
      "radius rounded-xs",
      "radius rounded-[22px]",
      "radius rounded-l-none",
      "radius rounded-tl-xl",
    ],
  );
});

test("passes the scale: tokens, type roles, steps and logical sides", () => {
  const onScale =
    "bg-background text-muted-foreground text-tertiary-foreground border-input bg-live text-ui text-sm text-caption rounded-sm rounded-md rounded-lg rounded-xl rounded-full rounded-none rounded-s-lg rounded-ee-md rounded-t-lg shadow-none top-2 text-start";
  assert.deepEqual(categories(onScale), []);
  // Positive control: the same string with one raw colour is caught.
  assert.deepEqual(categories(`${onScale} bg-neutral-900`), [
    "palette bg-neutral-900",
  ]);
});

test("allows floating shadows only in the floating-layer components", () => {
  const menu = "packages/ui/src/components/ui/floating-content.tsx";
  assert.deepEqual(categories("shadow-lg", menu), []);
  assert.deepEqual(categories("shadow-xl", menu), ["shadow shadow-xl"]);
  assert.deepEqual(
    categories("shadow-lg", "apps/desktop/src/sidebar/item.tsx"),
    ["shadow shadow-lg"],
  );
});

test("keeps the documented exceptions to their own files", () => {
  const thumb = "packages/ui/src/components/ui/switch.tsx";
  assert.deepEqual(categories("bg-white shadow-sm", thumb), []);
  assert.deepEqual(categories("bg-white shadow-sm", "apps/desktop/src/x.tsx"), [
    "palette bg-white",
    "shadow shadow-sm",
  ]);
});
