import { useEffect, useRef, useState, type ReactNode } from "react";

import { Avatar } from "@anlg/ui/components/avatar";
import {
  CaretDown,
  CaretRight,
  CircleNotch,
  Copy,
  DotsThree,
  FolderSimple,
  Gear,
  Lightbulb,
  MagnifyingGlass,
  Microphone,
  Note,
  PaperPlaneTilt,
  PencilSimple,
  Play,
  Plus,
  Trash,
  Users,
} from "@anlg/ui/components/icons";
import { showAppToast } from "@anlg/ui/components/ui/app-toast";
import { Badge } from "@anlg/ui/components/ui/badge";
import { Button } from "@anlg/ui/components/ui/button";
import { Card } from "@anlg/ui/components/ui/card";
import { Checkbox } from "@anlg/ui/components/ui/checkbox";
import { Chip } from "@anlg/ui/components/ui/chip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@anlg/ui/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { DirectionProvider } from "@anlg/ui/components/ui/direction";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { Input } from "@anlg/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@anlg/ui/components/ui/input-group";
import { Kbd, KbdGroup } from "@anlg/ui/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@anlg/ui/components/ui/popover";
import { Radio } from "@anlg/ui/components/ui/radio";
import { ListRow } from "@anlg/ui/components/ui/row";
import {
  SegmentedControl,
  SegmentedItem,
} from "@anlg/ui/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";
import { Skeleton } from "@anlg/ui/components/ui/skeleton";
import { Switch } from "@anlg/ui/components/ui/switch";
import { Textarea } from "@anlg/ui/components/ui/textarea";
import { Toaster } from "@anlg/ui/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipShortcut,
  TooltipTrigger,
} from "@anlg/ui/components/ui/tooltip";
import { cn } from "@anlg/utils";

import { DestructiveConfirmationDialog } from "~/shared/ui/destructive-confirmation-dialog";
import { EmptyState } from "~/shared/ui/empty-state";

type Scene = "components" | "floating" | "dialog" | "palette";
const SCENES: Scene[] = ["components", "floating", "dialog", "palette"];

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
const dir = params.get("dir") === "rtl" ? "rtl" : "ltr";
const scene: Scene =
  SCENES.find((s) => s === params.get("scene")) ?? "components";

export function Gallery() {
  if (theme !== "light" && theme !== "dark") return <SideBySide />;
  return <Frame theme={theme} />;
}

// Light and dark side by side, each in its own document so floating layers
// (portalled to <body>) pick up the right theme.
function SideBySide() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);
  const src = (frameTheme: string, extra = "") =>
    `?theme=${frameTheme}&scene=${scene}${extra}`;
  return (
    <div className="bg-muted text-foreground flex min-h-screen flex-col gap-3 p-3">
      <nav className="text-ui flex items-center gap-3">
        <span className="text-strong">Cue components</span>
        {SCENES.map((s) => (
          <a
            key={s}
            href={`?scene=${s}`}
            className={cn([
              "rounded-md px-2 py-1",
              s === scene
                ? "bg-background text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            ])}
          >
            {s}
          </a>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3">
        <AutoFrame src={src("light")} title="Light" />
        <AutoFrame src={src("dark")} title="Dark" />
      </div>
      <AutoFrame src={src("light", "&dir=rtl")} title="Light, right to left" />
    </div>
  );
}

function AutoFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === ref.current?.contentWindow &&
        typeof event.data?.galleryHeight === "number"
      ) {
        setHeight(event.data.galleryHeight);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      className="border-border w-full rounded-lg border"
      style={{ height }}
    />
  );
}

function Frame({ theme: frameTheme }: { theme: "light" | "dark" }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", frameTheme === "dark");
    document.documentElement.dir = dir;
    const node = rootRef.current;
    if (!node) return;
    const report = () =>
      window.parent.postMessage(
        { galleryHeight: Math.ceil(node.getBoundingClientRect().height) },
        "*",
      );
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [frameTheme]);

  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider>
        <div
          ref={rootRef}
          data-gallery-root
          className="bg-background text-foreground min-h-screen p-6"
        >
          {scene === "components" && <ComponentsScene />}
          {scene === "floating" && <FloatingScene />}
          {scene === "dialog" && <DialogScene />}
          {scene === "palette" && <PaletteScene />}
        </div>
      </TooltipProvider>
    </DirectionProvider>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-gallery-section={title}
      className={cn(["flex flex-col gap-3 py-5 first:pt-0", className])}
    >
      <h2 className="text-label text-muted-foreground font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      {label ? (
        <span className="text-caption text-tertiary-foreground w-24 shrink-0">
          {label}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const TEXT_ROLES = [
  ["text-page-title", "Weekly sync with Jisr"],
  ["text-title", "Notifications"],
  ["text-strong", "Product review"],
  ["text-body", "Summarise what we agreed on pricing."],
  ["text-ui", "Start listening"],
  ["text-label", "Today · 3 people"],
  ["text-caption", "2 min ago"],
] as const;

const SURFACES = [
  "bg-background",
  "bg-card",
  "bg-muted",
  "bg-accent",
  "bg-popover",
  "bg-sidebar",
] as const;

const INKS = [
  ["text-foreground", "Primary"],
  ["text-muted-foreground", "Secondary"],
  ["text-tertiary-foreground", "Tertiary"],
  ["text-destructive", "Destructive"],
] as const;

const MARKS = [
  "bg-warm",
  "bg-warm-strong",
  "bg-live",
  "bg-destructive",
  "bg-success",
  "bg-border",
  "bg-input",
] as const;

const VARIANTS = [
  "default",
  "secondary",
  "ghost",
  "destructive",
  "destructive-solid",
  "link",
] as const;

function ComponentsScene() {
  const [segment, setSegment] = useState("summary");
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("PDF");
  const [on, setOn] = useState(true);
  return (
    <div className="divide-border flex max-w-[860px] flex-col divide-y">
      <Section title="Type">
        {TEXT_ROLES.map(([role, sample]) => (
          <div key={role} className="flex items-baseline gap-3">
            <span className="text-caption text-tertiary-foreground w-24 shrink-0 tabular-nums">
              {role.replace("text-", "")}
            </span>
            <span className={role}>{sample}</span>
          </div>
        ))}
      </Section>

      <Section title="Colour">
        <Row label="surfaces">
          {SURFACES.map((surface) => (
            <span
              key={surface}
              className={cn([
                "border-border text-caption text-muted-foreground flex h-10 w-20 items-end rounded-md border p-1.5",
                surface,
              ])}
            >
              {surface.replace("bg-", "")}
            </span>
          ))}
        </Row>
        <Row label="text">
          {INKS.map(([ink, name]) => (
            <span key={ink} className={cn(["text-ui w-20", ink])}>
              {name}
            </span>
          ))}
        </Row>
        <Row label="marks">
          {MARKS.map((mark) => (
            <span
              key={mark}
              className="text-caption text-muted-foreground flex w-24 items-center gap-1.5"
            >
              <span className={cn(["size-2 rounded-full", mark])} />
              {mark.replace("bg-", "")}
            </span>
          ))}
        </Row>
      </Section>

      <Section title="Buttons">
        {VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant}>Default</Button>
            <Button variant={variant} size="sm">
              <Plus />
              New note
            </Button>
            <Button variant={variant} data-force="hover">
              Hover
            </Button>
            <Button variant={variant} data-force="active">
              Pressed
            </Button>
            <Button variant={variant} data-force="focus-visible">
              Focus
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </Row>
        ))}
        <Row label="icon">
          <Button variant="ghost" size="icon" aria-label="Search">
            <MagnifyingGlass />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="More"
            data-force="hover"
          >
            <DotsThree />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            data-force="focus-visible"
          >
            <Gear />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete" disabled>
            <Trash />
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="New note">
            <Plus />
          </Button>
          <Button size="round" aria-label="Send">
            <PaperPlaneTilt />
          </Button>
          <Button size="round" aria-label="Play">
            <Play />
          </Button>
          <Button size="sm" disabled>
            <CircleNotch className="animate-spin" />
            Saving
          </Button>
        </Row>
      </Section>

      <Section title="Fields">
        <Row label="input">
          <div className="grid w-full grid-cols-3 gap-2">
            <Input placeholder="Search notes" />
            <Input defaultValue="Weekly sync" data-force="focus" />
            <Input placeholder="Disabled" disabled />
            <Input defaultValue="not-an-email" aria-invalid />
            <InputGroup>
              <InputGroupAddon>
                <MagnifyingGlass />
              </InputGroupAddon>
              <InputGroupInput placeholder="Filter" />
              <InputGroupAddon align="inline-end">
                <Kbd>⌘F</Kbd>
              </InputGroupAddon>
            </InputGroup>
            <Select defaultValue="en">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Row>
        <Row label="textarea">
          <div className="grid w-full grid-cols-2 gap-2">
            <Textarea placeholder="Ask about this meeting" />
            <Textarea
              defaultValue="Follow up with Ömer about the pricing page."
              data-force="focus"
            />
          </div>
        </Row>
        <Row label="checkbox">
          <label className="text-ui flex items-center gap-2">
            <Checkbox
              checked={checked}
              onCheckedChange={(next) => setChecked(next === true)}
            />
            Show timestamps
          </label>
          <label className="text-ui flex items-center gap-2">
            <Checkbox />
            Unchecked
          </label>
          <label className="text-ui flex items-center gap-2">
            <Checkbox checked="indeterminate" />
            Some
          </label>
          <label className="text-ui flex items-center gap-2">
            <Checkbox data-force="focus-visible" />
            Focus
          </label>
          <label className="text-ui text-muted-foreground flex items-center gap-2">
            <Checkbox checked disabled />
            Disabled
          </label>
        </Row>
        <Row label="radio">
          {(["PDF", "Markdown", "Org"] as const).map((format) => (
            <label key={format} className="text-ui flex items-center gap-1.5">
              <Radio
                name="gallery-format"
                checked={radio === format}
                onChange={() => setRadio(format)}
              />
              {format}
            </label>
          ))}
          <label className="text-ui flex items-center gap-1.5">
            <Radio name="gallery-focus" data-force="focus-visible" />
            Focus
          </label>
          <label className="text-ui text-muted-foreground flex items-center gap-1.5">
            <Radio name="gallery-disabled" checked disabled readOnly />
            Disabled
          </label>
        </Row>
        <Row label="switch">
          <label className="text-ui flex items-center gap-2">
            <Switch checked={on} onCheckedChange={setOn} />
            Live captions
          </label>
          <label className="text-ui flex items-center gap-2">
            <Switch checked={false} />
            Off
          </label>
          <label className="text-ui flex items-center gap-2">
            <Switch checked data-force="focus-visible" />
            Focus
          </label>
          <label className="text-ui text-muted-foreground flex items-center gap-2">
            <Switch checked disabled />
            Disabled
          </label>
        </Row>
      </Section>

      <Section title="Segmented, chips, badges, keys">
        <Row label="segmented">
          <SegmentedControl
            aria-label="Note view"
            value={segment}
            onValueChange={setSegment}
          >
            <SegmentedItem value="memo">Memo</SegmentedItem>
            <SegmentedItem value="summary">Summary</SegmentedItem>
            <SegmentedItem value="transcript">Transcript</SegmentedItem>
          </SegmentedControl>
          <SegmentedControl
            aria-label="Theme"
            value="dark"
            onValueChange={() => {}}
          >
            <SegmentedItem value="light">Light</SegmentedItem>
            <SegmentedItem value="dark">Dark</SegmentedItem>
            <SegmentedItem value="system" data-force="focus-visible">
              System
            </SegmentedItem>
          </SegmentedControl>
        </Row>
        <Row label="chip">
          <Chip>What did we decide?</Chip>
          <Chip data-force="hover">Draft a follow-up</Chip>
          <Chip aria-pressed>Action items</Chip>
          <Chip disabled>Disabled</Chip>
        </Row>
        <Row label="badge">
          <Badge>Draft</Badge>
          <Badge tone="success">Connected</Badge>
          <Badge tone="warning">Needs setup</Badge>
          <Badge tone="destructive">Failed</Badge>
          <Badge tone="live">Recording</Badge>
          <Badge>
            <Users />3 people
          </Badge>
        </Row>
        <Row label="kbd">
          <Kbd>⌘K</Kbd>
          <KbdGroup>
            <Kbd>⇧</Kbd>
            <Kbd>⌘</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
          <Kbd>Esc</Kbd>
          <Kbd>⏎</Kbd>
        </Row>
      </Section>

      <Section title="Rows">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <ListRow>
              <Note />
              <span className="truncate">Product review</span>
            </ListRow>
            <ListRow data-force="hover">
              <Note />
              <span className="truncate">Hover</span>
            </ListRow>
            <ListRow selected>
              <Note />
              <span className="truncate">Selected</span>
            </ListRow>
            <ListRow>
              <span className="bg-live coach-live-dot size-1.5 shrink-0 rounded-full" />
              <span className="truncate">Recording now</span>
              <span className="text-caption text-tertiary-foreground ms-auto tabular-nums">
                12:04
              </span>
            </ListRow>
            <ListRow title="A very long note title that keeps going past the edge of the column">
              <Note />
              <span className="truncate">
                A very long note title that keeps going past the edge of the
                column
              </span>
            </ListRow>
          </div>
          <div className="bg-sidebar flex flex-col gap-0.5 rounded-lg p-2">
            <ListRow>
              <FolderSimple />
              <span className="truncate">Clients</span>
              <CaretRight className="ms-auto rtl:rotate-180" />
            </ListRow>
            <ListRow data-force="hover">
              <FolderSimple />
              <span className="truncate">Hover</span>
            </ListRow>
            <ListRow selected>
              <FolderSimple />
              <span className="truncate">Selected</span>
            </ListRow>
            <ListRow data-force="focus-visible">
              <Lightbulb />
              <span className="truncate">Focus</span>
            </ListRow>
          </div>
        </div>
      </Section>

      <Section title="Avatars, card, loading">
        <Row label="avatar">
          {[16, 20, 24, 28, 32, 40].map((size) => (
            <Avatar key={size} seed="Ömer Faruk" size={size} />
          ))}
          {[
            "Ahmad Falta",
            "Sara Lindqvist",
            "Nedal",
            "يوسف أحمد",
            "Mia Chen",
          ].map((name) => (
            <Avatar key={name} seed={name} size={28} />
          ))}
        </Row>
        <Row label="card">
          <Card className="w-72 px-3 pt-2.5 pb-3">
            <h3 className="text-strong">Wrap-up</h3>
            <p className="text-ui text-muted-foreground mt-1">
              Three decisions, two action items, one open question.
            </p>
          </Card>
          <div className="flex w-56 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-52" />
            <Skeleton className="h-3 w-32" />
            <span className="text-ui coach-sheen">Thinking…</span>
          </div>
        </Row>
        <Row label="empty">
          <div className="border-border w-full rounded-lg border">
            <EmptyState
              title="No notes yet"
              description="Start listening in a meeting and your notes show up here."
              action={{ label: "New note", onClick: () => {} }}
            />
          </div>
        </Row>
      </Section>

      <Section title="Tooltip">
        <div className="flex h-16 items-start gap-24 pt-8">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Search">
                <MagnifyingGlass />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Search
              <TooltipShortcut>⌘K</TooltipShortcut>
            </TooltipContent>
          </Tooltip>
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="New note">
                <PencilSimple />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">New note</TooltipContent>
          </Tooltip>
        </div>
      </Section>
    </div>
  );
}

function Stage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-[340px] flex-col items-start gap-2">
      <span className="text-caption text-tertiary-foreground">{label}</span>
      {children}
    </div>
  );
}

function FloatingScene() {
  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => highlighted.current?.focus(), 50);
    showAppToast({
      id: "gallery-toast",
      message: "Summary is ready",
      description: "Product review · 3 action items",
      tone: "success",
      durationMs: 600_000,
      action: { label: "Open", onClick: () => {} },
    });
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="grid max-w-[860px] grid-cols-3 gap-x-6">
      <Toaster />
      <Stage label="Dropdown menu">
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Note actions">
              <DotsThree />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem ref={highlighted}>
              <Copy />
              Copy link
              <DropdownMenuShortcut>⌘L</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <PencilSimple />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub open>
              <DropdownMenuSubTrigger>
                <FolderSimple />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-40">
                  <DropdownMenuItem>Clients</DropdownMenuItem>
                  <DropdownMenuItem>Hiring</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuItem disabled>
              <Microphone />
              Resume listening
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>
              <Trash />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Stage>

      <Stage label="Checkbox and radio items">
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              View
              <CaretDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value="date">
              <DropdownMenuRadioItem value="date">Date</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="folder">
                Folder
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked>
              Calendar
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={false}>
              Archived
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Stage>

      <Stage label="Select">
        <Select open defaultValue="en">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Spoken language</SelectLabel>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="tr">Türkçe</SelectItem>
              <SelectItem value="de" disabled>
                Deutsch
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Stage>

      <Stage label="Popover with content">
        <Popover open>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Users />3 people
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <h3 className="text-strong">Participants</h3>
            <p className="text-ui text-muted-foreground mt-1">
              Add people to this note so the coach knows who said what.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm">
                Cancel
              </Button>
              <Button size="sm">Add</Button>
            </div>
          </PopoverContent>
        </Popover>
      </Stage>

      <Stage label="Command list in a popover">
        <Popover open>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderSimple />
              Clients
              <CaretDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 overflow-hidden p-0">
            <Command>
              <CommandInput placeholder="Search or create folder" />
              <CommandList>
                <CommandEmpty>No folders.</CommandEmpty>
                <CommandGroup heading="Folders">
                  <CommandItem>
                    <FolderSimple />
                    Clients
                  </CommandItem>
                  <CommandItem>
                    <FolderSimple />
                    Hiring
                  </CommandItem>
                  <CommandItem>
                    <Plus />
                    New folder
                    <CommandShortcut>⌘N</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Stage>
    </div>
  );
}

function DialogScene() {
  return (
    <div className="h-[520px]">
      <Dialog open={params.get("confirm") !== "1"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Notes in this folder keep their links.
            </DialogDescription>
          </DialogHeader>
          <Input defaultValue="Clients" autoFocus />
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DestructiveConfirmationDialog
        open={params.get("confirm") === "1"}
        onOpenChange={() => {}}
        title="Delete this note?"
        description="The note, its summary and its transcript are removed from this Mac."
        confirmLabel="Delete"
        onConfirm={() => {}}
      />
    </div>
  );
}

function PaletteScene() {
  return (
    <div className="h-[520px]">
      <Dialog open>
        <DialogContent placement="top" className="max-w-[560px] gap-0 p-0">
          <DialogTitle className="sr-only">Search or jump to</DialogTitle>
          <Command className="[&_[cmdk-input-wrapper]]:h-11 [&_[cmdk-input-wrapper]_svg]:size-4">
            <CommandInput placeholder="Search or jump to…" />
            <CommandList>
              <CommandGroup heading="Notes">
                <CommandItem>
                  <Note />
                  Weekly sync with Jisr
                </CommandItem>
                <CommandItem>
                  <Note />
                  Product review
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Actions">
                <CommandItem>
                  <Plus />
                  New note
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <Gear />
                  Settings
                  <CommandShortcut>⌘,</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
