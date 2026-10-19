import { isValidElement, type ReactNode } from "react";

import { parseImageMetadata } from "@anlg/editor/node-views";
import { textDirection } from "@anlg/editor/text-direction";
import { cn } from "@anlg/utils";

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return plainText(node.props.children);
  }
  return "";
}

// Each block takes the direction of its own first letter, as in the editor,
// so an Arabic summary line or list item sits right-to-left next to English
// ones. Computed from the text rather than `dir="auto"`: a list item's text
// lives in a child paragraph that `auto` would skip.
function directed(Tag: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote") {
  return function Directed(props: React.HTMLAttributes<HTMLElement>) {
    return <Tag dir={textDirection(plainText(props.children)) ?? undefined} {...props} />;
  };
}

// Typography comes from the shared `.note-typography` scope (see
// packages/editor styles) so the streaming view matches the editor exactly;
// only structural concerns live here.
export const streamdownComponents = {
  p: directed("p"),
  h1: directed("h1"),
  h2: directed("h2"),
  h3: directed("h3"),
  h4: directed("h4"),
  h5: directed("h5"),
  h6: directed("h6"),
  blockquote: directed("blockquote"),
  // Streamdown's built-in li carries `py-1` (4px/side); the editor's rhythm is
  // 0.125em/side on `li > p`. Padding the li itself (with `[&>p]:inline` so
  // loose lists don't double-pad) keeps the flat streaming gap identical.
  // A nested list breaks that equivalence: the li's padding wraps the whole
  // li (text + sublist), while the editor pads only the text row. Shifting
  // the li's share onto the sublist via margins (mt adds the missing half
  // above, -mb cancels the li's bottom pad below) restores the 0.25em rhythm
  // without stretching the sublist's guide rail. `!` because note-typography's
  // `ul { margin-block: 0 }` reset is unlayered and outranks plain utilities.
  li: ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li
      dir={textDirection(plainText(props.children)) ?? undefined}
      {...props}
      className={cn([
        "py-[0.125em] [&>p]:inline",
        "[&>:is(ul,ol)]:mt-[0.125em]! [&>:is(ul,ol)]:-mb-[0.125em]!",
        className,
      ])}
    />
  ),
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { editorWidth, title } = parseImageMetadata(props.title);

    return (
      <img
        {...props}
        title={title}
        className={cn(["max-w-full", props.className])}
        style={{
          ...(editorWidth ? { width: `${editorWidth}%` } : {}),
          ...(props.style || {}),
        }}
      />
    );
  },
} as const;
