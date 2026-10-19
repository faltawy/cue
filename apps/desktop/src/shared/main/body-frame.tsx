import { MainBodyPanels } from "./body-panels";

export function MainShellBodyFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainBodyPanels>{children}</MainBodyPanels>;
}
