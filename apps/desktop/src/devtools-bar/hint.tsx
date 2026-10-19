import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@anlg/ui/components/ui/tooltip";
import { cn } from "@anlg/utils";

/** Dark monospace tooltip shared by the bar's segments and menu items. */
export function Hint(props: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "right";
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{props.children}</TooltipTrigger>
      <TooltipContent
        side={props.side ?? "top"}
        sideOffset={props.side === "right" ? 8 : 6}
        className={cn([
          "dark border-border bg-background text-foreground border",
          "text-caption max-w-72 px-2.5 py-1.5 font-mono leading-4",
        ])}
      >
        {props.content}
      </TooltipContent>
    </Tooltip>
  );
}
