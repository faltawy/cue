import { VisualTargetKind } from "@anlg/assistant/browser-context";
const ids = new WeakMap<
  Element,
  { id: string; label: string; kind: VisualTargetKind }
>();
const elements = new Map<
  string,
  { element: HTMLElement; label: string; kind: VisualTargetKind }
>();
function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    !element.closest('[hidden], [aria-hidden="true"]') &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth
  );
}
export function visualTargets(document: Document) {
  elements.clear();
  const result: { id: string; kind: VisualTargetKind; label: string }[] = [];
  const groups: [VisualTargetKind, string][] = [
    [
      VisualTargetKind.Presentation,
      '[data-is-presentation="true"], [data-presentation-id]',
    ],
    [VisualTargetKind.Participant, "[data-participant-id]"],
    [VisualTargetKind.Captions, '[jsname="dsyhDe"], [data-caption-container]'],
    [VisualTargetKind.Chat, '[role="log"], [aria-label="In-call messages"]'],
    [
      VisualTargetKind.Control,
      'button, [role="button"], [role="switch"], [role="tab"]',
    ],
    [VisualTargetKind.Heading, 'h1, h2, [role="heading"]'],
  ];
  const seen = new Set<Element>();
  for (const [kind, selector] of groups) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (result.length >= 120) break;
      if (seen.has(element) || !visible(element)) continue;
      const label = labelFor(element, kind);
      if (!label) continue;
      let previous = ids.get(element);
      if (!previous || previous.label !== label || previous.kind !== kind) {
        previous = { id: crypto.randomUUID(), label, kind };
        ids.set(element, previous);
      }
      const id = previous.id;
      seen.add(element);
      elements.set(id, { element, label, kind });
      result.push({ id, kind, label });
    }
  }
  return result;
}
export function visualTarget(id: string): HTMLElement | undefined {
  const target = elements.get(id);
  return target?.element.isConnected &&
    visible(target.element) &&
    labelFor(target.element, target.kind) === target.label
    ? target.element
    : undefined;
}

function labelFor(element: HTMLElement, kind: VisualTargetKind) {
  return (
    element.getAttribute("data-participant-name") ||
    element.getAttribute("aria-label") ||
    element.getAttribute("data-tooltip") ||
    element.getAttribute("title") ||
    (kind === VisualTargetKind.Captions
      ? "Live captions"
      : kind === VisualTargetKind.Presentation
        ? "Shared presentation"
        : element.innerText)
  )
    .trim()
    .slice(0, 160);
}
