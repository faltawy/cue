import { create } from "zustand";

import { DevtoolsToastPreview } from "~/store/zustand/enums";

export { DevtoolsToastPreview };

type ActiveDevtoolsToastPreview = {
  type: DevtoolsToastPreview;
  key: number;
};

type DevtoolsToastPreviewState = {
  preview: ActiveDevtoolsToastPreview | null;
  showPreview: (type: DevtoolsToastPreview) => void;
  clearPreview: () => void;
};

export const useDevtoolsToastPreview = create<DevtoolsToastPreviewState>(
  (set) => ({
    preview: null,
    showPreview: (type) =>
      set((state) => ({
        preview: {
          type,
          key: (state.preview?.key ?? 0) + 1,
        },
      })),
    clearPreview: () => set({ preview: null }),
  }),
);
