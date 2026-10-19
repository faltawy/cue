import { create } from "zustand";

export type SidebarNotesGroupBy = "date" | "folder";
type SidebarNotesSortOrder = "newest" | "oldest";

type SidebarNotesState = {
  folderFilter: string | null;
  groupBy: SidebarNotesGroupBy;
  sortOrder: SidebarNotesSortOrder;
  setFolderFilter: (folderFilter: string | null) => void;
  setGroupBy: (groupBy: SidebarNotesGroupBy) => void;
  setSortOrder: (sortOrder: SidebarNotesSortOrder) => void;
};

const defaultSidebarNotes = {
  folderFilter: null,
  groupBy: "date" as const,
  sortOrder: "newest" as const,
};

export const useSidebarNotes = create<SidebarNotesState>((set) => ({
  ...defaultSidebarNotes,
  setFolderFilter: (folderFilter) => set({ folderFilter }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));

export function resetSidebarNotes() {
  useSidebarNotes.setState({ ...defaultSidebarNotes });
}
