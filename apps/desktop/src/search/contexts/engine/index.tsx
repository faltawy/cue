import { createContext, useCallback, useContext, useMemo } from "react";

import { commands as tantivy } from "@anlg/plugin-tantivy";

import { buildTantivyFilters } from "./filters";
import type {
  NoteSearchHit,
  SearchEntityType,
  SearchFilters,
  SearchHit,
} from "./types";
import { normalizeQuery } from "./utils";

export type { NoteSearchHit, SearchFilters, SearchHit } from "./types";

const NOTE_SEARCH_LIMIT = 30;
const NOTE_SNIPPET_MAX_CHARS = 120;

const SearchEngineContext = createContext<{
  search: (
    query: string,
    filters?: SearchFilters | null,
  ) => Promise<SearchHit[]>;
  searchNotes: (query: string) => Promise<NoteSearchHit[]>;
} | null>(null);

export function SearchEngineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const search = useCallback(
    async (
      query: string,
      filters: SearchFilters | null = null,
    ): Promise<SearchHit[]> => {
      const normalizedQuery = normalizeQuery(query);
      const tantivyFilters = buildTantivyFilters(filters);

      try {
        const result = await tantivy.search({
          query: normalizedQuery,
          filters: tantivyFilters,
        });

        if (result.status === "error") {
          console.error("Search failed:", result.error);
          return [];
        }

        const hits = result.data.hits.map((hit) => ({
          score: hit.score,
          document: {
            id: hit.document.id,
            type: hit.document.doc_type as SearchEntityType,
            title: hit.document.title,
            content: hit.document.content,
            created_at: hit.document.created_at,
          },
        }));
        return hits;
      } catch (error) {
        console.error("Search failed:", error);
        return [];
      }
    },
    [],
  );

  const searchNotes = useCallback(
    async (query: string): Promise<NoteSearchHit[]> => {
      const result = await tantivy.search({
        query: normalizeQuery(query),
        filters: { created_at: null, doc_type: "session", facet: null },
        limit: NOTE_SEARCH_LIMIT,
        options: {
          fuzzy: null,
          distance: null,
          snippets: true,
          snippet_max_chars: NOTE_SNIPPET_MAX_CHARS,
          phrase_slop: null,
        },
      });
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data.hits.flatMap((hit) =>
        hit.content_snippet
          ? [
              {
                id: hit.document.id,
                section: hit.matched_section,
                snippet: hit.content_snippet.segments,
              },
            ]
          : [],
      );
    },
    [],
  );

  const value = useMemo(() => ({ search, searchNotes }), [search, searchNotes]);

  return (
    <SearchEngineContext.Provider value={value}>
      {children}
    </SearchEngineContext.Provider>
  );
}

export function useSearchEngine() {
  const context = useContext(SearchEngineContext);
  if (!context) {
    throw new Error("useSearchEngine must be used within SearchEngineProvider");
  }
  return context;
}
