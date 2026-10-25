import { create } from "zustand";

import {
  TimelineGroupBy as SidebarNotesGroupBy,
  NoteSortOrder as SidebarNotesSortOrder,
  SidebarSectionId,
} from "~/sidebar/enums";

export { SidebarNotesGroupBy };

type SidebarNotesState = {
  folderFilter: string | null;
  tagFilter: string | null;
  groupBy: SidebarNotesGroupBy;
  sortOrder: SidebarNotesSortOrder;
  collapsedSections: SidebarSectionId[];
  expandedFolders: string[];
  setFolderFilter: (folderFilter: string | null) => void;
  setTagFilter: (tagFilter: string | null) => void;
  setGroupBy: (groupBy: SidebarNotesGroupBy) => void;
  setSortOrder: (sortOrder: SidebarNotesSortOrder) => void;
  setSectionExpanded: (section: SidebarSectionId, expanded: boolean) => void;
  setFolderExpanded: (path: string, expanded: boolean) => void;
};

const defaultSidebarNotes = {
  folderFilter: null,
  tagFilter: null,
  groupBy: SidebarNotesGroupBy.Date,
  sortOrder: SidebarNotesSortOrder.Newest,
  collapsedSections: [],
  expandedFolders: [],
};

export const useSidebarNotes = create<SidebarNotesState>((set) => ({
  ...defaultSidebarNotes,
  setFolderFilter: (folderFilter) => set({ folderFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
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
