import { cn } from "@anlg/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(["coach-skeleton", className])}
      {...props}
    />
  );
}

export { Skeleton };
