import { describe, expect, test } from "bun:test";

import { estimateTokens } from "./pricing";
import { renderRecentLines } from "./transcript-window";
import type { TranscriptLine } from "./transcript";

const line = (text: string, start: number): TranscriptLine => ({
  speaker: "Omar",
  channel: 1,
  start_ms: start * 1_000,
  end_ms: start * 1_000 + 2_000,
  text,
});

describe("renderRecentLines", () => {
  test("keeps the newest line within budget and drops older transcript", () => {
    const lines = [
      line(`OLDEST ${"early agenda details ".repeat(180)}`, 1),
      ...Array.from({ length: 8 }, (_, index) =>
        line(`middle ${index} ${"status update ".repeat(40)}`, index + 2),
      ),
      line("NEWEST Spanish: ¿Quién confirma el plazo?", 20),
    ];

    const rendered = renderRecentLines(lines, 900);

    expect(rendered).toContain("NEWEST Spanish: ¿Quién confirma el plazo?");
    expect(rendered).not.toContain("OLDEST");
    expect(estimateTokens(rendered)).toBeLessThanOrEqual(900);
  });

  test("tail-truncates one oversized newest line rather than losing it", () => {
    const rendered = renderRecentLines(
      [line(`Newest Arabic: ${"محتاجين نحدد الموعد ".repeat(500)}`, 1)],
      80,
    );

    expect(rendered).toContain("[00:01] Omar: …");
    expect(rendered).toEndWith("محتاجين نحدد الموعد");
    expect(estimateTokens(rendered)).toBeLessThanOrEqual(80);
    expect(rendered).toContain("…");
  });
});
