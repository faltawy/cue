import { AppLinkProvider } from "./provider";

export enum FigmaLinkKind {
  Board = "board",
  Design = "design",
  File = "file",
  Prototype = "prototype",
  Slides = "slides",
}

export interface FigmaAttrs {
  provider: AppLinkProvider.Figma;
  kind: FigmaLinkKind;
  url: string;
  resourceId?: string;
  resourceTitle?: string;
}

function getKindLabel(kind: FigmaLinkKind): string {
  switch (kind) {
    case FigmaLinkKind.Board:
      return "FigJam board";
    case FigmaLinkKind.Design:
    case FigmaLinkKind.File:
      return "Design file";
    case FigmaLinkKind.Prototype:
      return "Prototype";
    case FigmaLinkKind.Slides:
      return "Slides";
  }
}

export function getFigmaDisplayParts(attrs: FigmaAttrs): {
  header: string;
  subline: string;
} {
  return {
    header: "Figma",
    subline: attrs.resourceTitle
      ? `${getKindLabel(attrs.kind)}: ${attrs.resourceTitle}`
      : getKindLabel(attrs.kind),
  };
}
