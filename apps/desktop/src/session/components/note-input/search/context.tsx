import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  findSearchContainer,
  getMatchingElements,
  type MatchResult,
  type SearchOptions,
} from "./matching";

import { NoteSearchAction } from "~/session/enums";

interface SearchContextValue {
  query: string;
  isVisible: boolean;
  currentMatchIndex: number;
  totalMatches: number;
  activeMatchId: string | null;
  caseSensitive: boolean;
  wholeWord: boolean;
  showReplace: boolean;
  replaceQuery: string;
  onNext: () => void;
  onPrev: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  toggleReplace: () => void;
  setReplaceQuery: (query: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch() {
  return useContext(SearchContext);
}

interface SearchState {
  isVisible: boolean;
  query: string;
  currentMatchIndex: number;
  totalMatches: number;
  activeMatchId: string | null;
  caseSensitive: boolean;
  wholeWord: boolean;
  showReplace: boolean;
  replaceQuery: string;
}

type SearchAction =
  | { type: NoteSearchAction.ToggleVisible }
  | { type: NoteSearchAction.OpenVisible }
  | { type: NoteSearchAction.Close }
  | { type: NoteSearchAction.SetQuery; query: string }
  | { type: NoteSearchAction.SetReplaceQuery; query: string }
  | { type: NoteSearchAction.ToggleCaseSensitive }
  | { type: NoteSearchAction.ToggleWholeWord }
  | { type: NoteSearchAction.ToggleReplace }
  | {
      type: NoteSearchAction.SetMatches;
      totalMatches: number;
      currentMatchIndex: number;
      activeMatchId: string | null;
    }
  | {
      type: NoteSearchAction.Navigate;
      currentMatchIndex: number;
      activeMatchId: string | null;
    };

const initialState: SearchState = {
  isVisible: false,
  query: "",
  currentMatchIndex: 0,
  totalMatches: 0,
  activeMatchId: null,
  caseSensitive: false,
  wholeWord: false,
  showReplace: false,
  replaceQuery: "",
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case NoteSearchAction.ToggleVisible:
      return state.isVisible
        ? { ...initialState }
        : { ...state, isVisible: true };
    case NoteSearchAction.OpenVisible:
      return { ...state, isVisible: true };
    case NoteSearchAction.Close:
      return { ...initialState };
    case NoteSearchAction.SetQuery:
      return { ...state, query: action.query };
    case NoteSearchAction.SetReplaceQuery:
      return { ...state, replaceQuery: action.query };
    case NoteSearchAction.ToggleCaseSensitive:
      return { ...state, caseSensitive: !state.caseSensitive };
    case NoteSearchAction.ToggleWholeWord:
      return { ...state, wholeWord: !state.wholeWord };
    case NoteSearchAction.ToggleReplace:
      return { ...state, showReplace: !state.showReplace };
    case NoteSearchAction.SetMatches:
      return {
        ...state,
        totalMatches: action.totalMatches,
        currentMatchIndex: action.currentMatchIndex,
        activeMatchId: action.activeMatchId,
      };
    case NoteSearchAction.Navigate:
      return {
        ...state,
        currentMatchIndex: action.currentMatchIndex,
        activeMatchId: action.activeMatchId,
      };
  }
}

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  const matchesRef = useRef<MatchResult[]>([]);

  const opts: SearchOptions = useMemo(
    () => ({ caseSensitive: state.caseSensitive, wholeWord: state.wholeWord }),
    [state.caseSensitive, state.wholeWord],
  );

  useHotkeys(
    "mod+f",
    (event) => {
      event.preventDefault();
      dispatch({ type: NoteSearchAction.ToggleVisible });
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [],
  );

  useHotkeys(
    "mod+h",
    (event) => {
      event.preventDefault();
      dispatch({ type: NoteSearchAction.OpenVisible });
      dispatch({ type: NoteSearchAction.ToggleReplace });
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [],
  );

  useHotkeys(
    "esc",
    () => {
      dispatch({ type: NoteSearchAction.Close });
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [],
  );

  const runSearch = useCallback(() => {
    const container = findSearchContainer();
    if (!container || !state.query) {
      matchesRef.current = [];
      dispatch({
        type: NoteSearchAction.SetMatches,
        totalMatches: 0,
        currentMatchIndex: 0,
        activeMatchId: null,
      });
      return;
    }

    const matches = getMatchingElements(container, state.query, opts);
    matchesRef.current = matches;
    dispatch({
      type: NoteSearchAction.SetMatches,
      totalMatches: matches.length,
      currentMatchIndex: 0,
      activeMatchId: matches[0]?.id || null,
    });

    if (matches.length > 0 && !matches[0].id) {
      matches[0].element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [state.query, opts]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const onNext = useCallback(() => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;

    const nextIndex = (state.currentMatchIndex + 1) % matches.length;
    dispatch({
      type: NoteSearchAction.Navigate,
      currentMatchIndex: nextIndex,
      activeMatchId: matches[nextIndex]?.id || null,
    });
    matches[nextIndex]?.element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [state.currentMatchIndex]);

  const onPrev = useCallback(() => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;

    const prevIndex =
      (state.currentMatchIndex - 1 + matches.length) % matches.length;
    dispatch({
      type: NoteSearchAction.Navigate,
      currentMatchIndex: prevIndex,
      activeMatchId: matches[prevIndex]?.id || null,
    });
    matches[prevIndex]?.element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [state.currentMatchIndex]);

  useEffect(() => {
    if (!state.isVisible || !state.activeMatchId) return;

    const container = findSearchContainer();
    if (!container) return;

    const element = container.querySelector<HTMLElement>(
      `[data-word-id="${state.activeMatchId}"]`,
    );

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state.isVisible, state.activeMatchId]);

  const value = useMemo(
    () => ({
      query: state.query,
      isVisible: state.isVisible,
      currentMatchIndex: state.currentMatchIndex,
      totalMatches: state.totalMatches,
      activeMatchId: state.activeMatchId,
      caseSensitive: state.caseSensitive,
      wholeWord: state.wholeWord,
      showReplace: state.showReplace,
      replaceQuery: state.replaceQuery,
      onNext,
      onPrev,
      close: () => dispatch({ type: NoteSearchAction.Close }),
      setQuery: (query: string) =>
        dispatch({ type: NoteSearchAction.SetQuery, query }),
      toggleCaseSensitive: () =>
        dispatch({ type: NoteSearchAction.ToggleCaseSensitive }),
      toggleWholeWord: () =>
        dispatch({ type: NoteSearchAction.ToggleWholeWord }),
      toggleReplace: () => dispatch({ type: NoteSearchAction.ToggleReplace }),
      setReplaceQuery: (query: string) =>
        dispatch({ type: NoteSearchAction.SetReplaceQuery, query }),
    }),
    [state, onNext, onPrev],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}
