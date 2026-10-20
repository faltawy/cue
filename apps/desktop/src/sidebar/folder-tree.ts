import {
  isFolderOrDescendant,
  normalizeFolderPath,
  parentFolderPath,
} from "~/session/folders";

export type FolderNode = {
  path: string;
  name: string;
  depth: number;
  count: number;
  children: FolderNode[];
};

// `counts` holds notes filed directly in each folder; a node's count also
// includes its subfolders, matching what the folder filter shows.
export function buildFolderTree(
  paths: string[],
  counts: Record<string, number>,
): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const parent = parentFolderPath(path);
    const node: FolderNode = {
      path,
      name: parent ? path.slice(parent.length + 1) : path,
      depth: parent ? (nodes.get(parent)?.depth ?? -1) + 1 : 0,
      count: 0,
      children: [],
    };
    nodes.set(path, node);
    (nodes.get(parent)?.children ?? roots).push(node);
  }

  for (const [rawPath, count] of Object.entries(counts)) {
    let path = normalizeFolderPath(rawPath) ?? "";
    while (path) {
      const node = nodes.get(path);
      if (node) node.count += count;
      path = parentFolderPath(path);
    }
  }
  return roots;
}

export function visibleFolderNodes(
  roots: FolderNode[],
  expanded: ReadonlySet<string>,
): FolderNode[] {
  const rows: FolderNode[] = [];
  const visit = (node: FolderNode) => {
    rows.push(node);
    if (expanded.has(node.path)) node.children.forEach(visit);
  };
  roots.forEach(visit);
  return rows;
}

export function folderMoveTargets(paths: string[], path: string): string[] {
  const parent = parentFolderPath(path);
  return paths.filter(
    (candidate) =>
      candidate !== parent && !isFolderOrDescendant(candidate, path),
  );
}
