import { create } from "zustand";

export type SidebarNotesGroupBy = "date" | "folder";
type SidebarNotesSortOrder = "newest" | "oldest";
type SidebarSectionId = "folders";

type SidebarNotesState = {
  folderFilter: string | null;
  groupBy: SidebarNotesGroupBy;
  sortOrder: SidebarNotesSortOrder;
  collapsedSections: SidebarSectionId[];
  expandedFolders: string[];
  setFolderFilter: (folderFilter: string | null) => void;
  setGroupBy: (groupBy: SidebarNotesGroupBy) => void;
  setSortOrder: (sortOrder: SidebarNotesSortOrder) => void;
  setSectionExpanded: (section: SidebarSectionId, expanded: boolean) => void;
  setFolderExpanded: (path: string, expanded: boolean) => void;
};

const defaultSidebarNotes = {
  folderFilter: null,
  groupBy: "date" as const,
  sortOrder: "newest" as const,
  collapsedSections: [],
  expandedFolders: [],
};

export const useSidebarNotes = create<SidebarNotesState>((set) => ({
  ...defaultSidebarNotes,
  setFolderFilter: (folderFilter) => set({ folderFilter }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setSectionExpanded: (section, expanded) =>
    set((state) => ({
      collapsedSections: expanded
        ? state.collapsedSections.filter((id) => id !== section)
        : [...new Set([...state.collapsedSections, section])],
    })),
  setFolderExpanded: (path, expanded) =>
    set((state) => ({
      expandedFolders: expanded
        ? [...new Set([...state.expandedFolders, path])]
        : state.expandedFolders.filter((folder) => folder !== path),
    })),
}));

export function resetSidebarNotes() {
  useSidebarNotes.setState({ ...defaultSidebarNotes });
}
