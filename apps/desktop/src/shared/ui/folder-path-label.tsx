import { textDirection } from "@anlg/editor/text-direction";
import { cn } from "@anlg/utils";

// "Clients/Northwind/Q4" -> parent "Clients/Northwind", leaf "/Q4". The leaf
// keeps its slash so a truncated parent still reads as a path.
export function splitFolderPath(path: string): {
  parent: string;
  leaf: string;
} {
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return { parent: "", leaf: path };
  return { parent: path.slice(0, slash), leaf: path.slice(slash) };
}

// Folders differ at the end, so a long path gives up its parents first and
// keeps the folder's own name: "Clients/No…/Enterprise onboarding".
export function FolderPathLabel({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const { parent, leaf } = splitFolderPath(path);
  const dir = textDirection(path) ?? undefined;
  if (!parent) {
    return (
      <span
        title={path}
        dir={dir}
        className={cn(["block w-fit max-w-full min-w-0 truncate", className])}
      >
        {path}
      </span>
    );
  }
  return (
    <span
      title={path}
      dir={dir}
      className={cn(["flex w-fit max-w-full min-w-0", className])}
    >
      {/* Read and matched as one path; the halves are only for clipping. */}
      <span className="sr-only">{path}</span>
      <span aria-hidden className="min-w-[2ch] shrink-[999] truncate">
        {parent}
      </span>
      <span aria-hidden className="min-w-0 truncate">
        {leaf}
      </span>
    </span>
  );
}
