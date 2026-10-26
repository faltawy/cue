import { charTokens, estimateTokens } from "@anlg/assistant/pricing";

import { renderLines, type TranscriptLine } from "./transcript";

export function headWithin(text: string, maxTokens: number): string {
  let used = 0;
  let end = 0;
  for (const char of text) {
    used += charTokens(char);
    if (used > maxTokens) return `${text.slice(0, end).trimEnd()}…`;
    end += char.length;
  }
  return text;
}

function tailWithin(text: string, maxTokens: number): string {
  const chars = [...text];
  let used = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    used += charTokens(chars[index] ?? "");
    if (used > maxTokens)
      return `…${chars
        .slice(index + 1)
        .join("")
        .trimStart()}`;
  }
  return text;
}

export function renderRecentLines(
  lines: readonly TranscriptLine[],
  maxTokens: number,
): string {
  const kept: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const current = lines[index];
    if (!current) continue;
    const candidate = [renderLines([current]), ...kept].join("\n");
    if (estimateTokens(candidate) <= maxTokens) {
      kept.unshift(renderLines([current]));
      continue;
    }

    if (kept.length > 0) break;

    const prefix = renderLines([{ ...current, text: "" }]);
    const availableTextTokens = Math.max(
      0,
      maxTokens - estimateTokens(prefix) - 2,
    );
    const clipped = tailWithin(current.text.trim(), availableTextTokens);
    const newest = renderLines([{ ...current, text: clipped }]);
    return estimateTokens(newest) <= maxTokens
      ? newest
      : prefix.slice(0, Math.max(0, prefix.length - 1));
  }
  return kept.join("\n");
}
