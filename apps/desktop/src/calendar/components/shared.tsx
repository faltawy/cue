import type { ReactNode } from "react";

export type CalendarProvider = {
  id: string;
  displayName: string;
  icon: ReactNode;
};

const _PROVIDERS = [
  {
    id: "apple",
    displayName: "Apple Calendar",
    icon: (
      <img
        src="/assets/apple-calendar.png"
        alt="Apple Calendar"
        className="size-5 rounded-[4px] object-cover"
      />
    ),
  },
] as const satisfies readonly CalendarProvider[];

export const PROVIDERS = [..._PROVIDERS];
