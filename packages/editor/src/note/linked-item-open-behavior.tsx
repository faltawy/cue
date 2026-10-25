import { createContext, useContext } from "react";

export enum LinkedItemOpenBehavior {
  Current = "current",
  New = "new",
}

export const LinkedItemOpenBehaviorContext =
  createContext<LinkedItemOpenBehavior>(LinkedItemOpenBehavior.Current);

export function useLinkedItemOpenBehavior() {
  return useContext(LinkedItemOpenBehaviorContext);
}
