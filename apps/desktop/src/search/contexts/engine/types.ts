import { z } from "zod";

import type { SearchSectionKind, SnippetSegment } from "@anlg/plugin-tantivy";

import { SearchEntityType } from "~/search/enums";

const searchEntityTypeSchema = z.enum(SearchEntityType);
export { SearchEntityType };

const searchDocumentSchema = z.object({
  id: z.string(),
  type: searchEntityTypeSchema,
  title: z.string(),
  content: z.string(),
  created_at: z.number(),
});

type SearchDocument = z.infer<typeof searchDocumentSchema>;

const numberFilterSchema = z
  .object({
    gte: z.number().optional(),
    lte: z.number().optional(),
    gt: z.number().optional(),
    lt: z.number().optional(),
    eq: z.number().optional(),
  })
  .optional();

const searchFiltersSchema = z.object({
  created_at: numberFilterSchema,
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export type SearchHit = {
  score: number;
  document: SearchDocument;
};

export type NoteSearchHit = {
  id: string;
  section: SearchSectionKind | null;
  snippet: SnippetSegment[];
};
