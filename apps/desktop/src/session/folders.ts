export {
  ancestorFolderPaths,
  childFolderPath,
  collectFolderPaths,
  folderDisplayName,
  folderPathMatchesFilter,
  normalizeFolderPath,
} from "@anlg/utils/folders";

export function parentFolderPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

export function isFolderOrDescendant(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

// Rewrites `path` when it is `from` or sits under it, for state that pointed
// at a folder that was renamed or moved.
export function remapFolderPath(path: string, from: string, to: string) {
  return isFolderOrDescendant(path, from)
    ? `${to}${path.slice(from.length)}`
    : path;
}
