import { forwardRef } from "react";

import { cn } from "@anlg/utils";

export enum CardVariant {
  Default = "default",
  OutlineSolid = "outline-solid",
  Ghost = "ghost",
}

export enum CardSpacing {
  Default = "default",
  Compact = "compact",
  Loose = "loose",
}

export enum CardAlign {
  Start = "start",
  Center = "center",
  End = "end",
  Between = "between",
  Around = "around",
  Evenly = "evenly",
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = CardVariant.Default, ...props }, ref) => (
    <div
      ref={ref}
      className={cn([
        "rounded-lg",
        variant === CardVariant.Default && "bg-background border-border border",
        variant === CardVariant.OutlineSolid && "border-border border",
        variant === CardVariant.Ghost && "border-none",
        className,
      ])}
      {...props}
    />
  ),
);
Card.displayName = "Card";

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: CardSpacing;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, spacing = CardSpacing.Default, ...props }, ref) => (
    <div
      ref={ref}
      className={cn([
        "flex flex-col",
        spacing === CardSpacing.Default && "gap-1.5 p-6",
        spacing === CardSpacing.Compact && "gap-1 p-4",
        spacing === CardSpacing.Loose && "gap-2 p-8",
        className,
      ])}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Component = "h3", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(["text-strong", className])}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(["text-ui text-muted-foreground", className])}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: CardSpacing;
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, spacing = CardSpacing.Default, ...props }, ref) => (
    <div
      ref={ref}
      className={cn([
        spacing === CardSpacing.Default && "p-6 pt-0",
        spacing === CardSpacing.Compact && "p-4 pt-0",
        spacing === CardSpacing.Loose && "p-8 pt-0",
        className,
      ])}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: CardSpacing;
  align?: CardAlign;
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  (
    {
      className,
      spacing = CardSpacing.Default,
      align = CardAlign.Between,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn([
        "flex",
        spacing === CardSpacing.Default && "p-6 pt-0",
        spacing === CardSpacing.Compact && "p-4 pt-0",
        spacing === CardSpacing.Loose && "p-8 pt-0",
        align === CardAlign.Start && "justify-start",
        align === CardAlign.Center && "justify-center",
        align === CardAlign.End && "justify-end",
        align === CardAlign.Between && "justify-between",
        align === CardAlign.Around && "justify-around",
        align === CardAlign.Evenly && "justify-evenly",
        className,
      ])}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";
