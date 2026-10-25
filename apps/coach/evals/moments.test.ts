import { describe, expect, test } from "bun:test";

import { EvalKind, momentHits, momentLines, MOMENTS } from "./moments";

describe("coaching eval moments", () => {
  test.each(
    MOMENTS.filter((moment) => moment.kind === EvalKind.Nudge).map(
      (moment) => [moment.id, moment] as const,
    ),
  )(
    "%s is one the detectors would flag, so a nudge could really reach it",
    (_, moment) => {
      expect(momentHits(moment, momentLines(moment)).length).toBeGreaterThan(0);
    },
  );

  test("the set covers enough moments, Arabic, silence and direct asks", () => {
    const nudges = MOMENTS.filter((moment) => moment.kind === EvalKind.Nudge);
    expect(nudges.length).toBeGreaterThanOrEqual(24);
    expect(
      MOMENTS.filter((moment) => moment.lang === "ar").length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      nudges.filter((moment) => moment.silent).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      MOMENTS.filter((moment) => moment.kind === EvalKind.Ask && moment.ask)
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(new Set(MOMENTS.map((moment) => moment.id)).size).toBe(
      MOMENTS.length,
    );
  });
});
