import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { textDirection, type TextDirection } from "../text-direction";

const DIRECTED_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "taskItem",
]);

function nodeDirection(node: PMNode): TextDirection | null {
  if (node.isText) return textDirection(node.text ?? "");
  for (let index = 0; index < node.childCount; index++) {
    const direction = nodeDirection(node.child(index));
    if (direction) return direction;
  }
  return null;
}

function directionDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock && !DIRECTED_NODES.has(node.type.name)) return false;
    if (!DIRECTED_NODES.has(node.type.name)) return true;
    const dir = nodeDirection(node);
    if (dir) decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir }));
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

export const textDirectionPluginKey = new PluginKey<DecorationSet>("textDirection");

// Each block takes the direction of its own first letter, so Arabic and
// English paragraphs, list items and quotes sit side by side in one note
// without a document-wide switch. Nothing is stored in the note.
export function textDirectionPlugin() {
  return new Plugin<DecorationSet>({
    key: textDirectionPluginKey,
    state: {
      init: (_, state) => directionDecorations(state.doc),
      apply: (tr, decorations) =>
        tr.docChanged ? directionDecorations(tr.doc) : decorations,
    },
    props: {
      decorations: (state) => textDirectionPluginKey.getState(state),
    },
  });
}
