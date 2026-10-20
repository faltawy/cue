import { commands } from "@anlg/plugin-session";

import { useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

export type TagCount = { name: string; count: number };

const EMPTY_TAG_NAMES: string[] = [];
const EMPTY_TAG_COUNTS: TagCount[] = [];

export function useSessionTagNames(sessionId: string): string[] {
  const { data = EMPTY_TAG_NAMES } = useLiveQuery<{ name: string }, string[]>({
    sql: `
        SELECT tags.name
        FROM session_tags
        INNER JOIN tags
          ON tags.id = session_tags.tag_id
          AND tags.deleted_at IS NULL
        WHERE session_tags.session_id = ?
          AND session_tags.deleted_at IS NULL
        ORDER BY session_tags.created_at, tags.name
      `,
    params: [sessionId],
    mapRows: (rows) => rows.map((row) => row.name),
  });
  return data;
}

// Tags on live notes, most used first.
export function useTagCounts(): TagCount[] {
  const { data = EMPTY_TAG_COUNTS } = useLiveQuery<
    { name: string; note_count: number },
    TagCount[]
  >({
    sql: `
      SELECT tags.name AS name, COUNT(DISTINCT sessions.id) AS note_count
      FROM session_tags
      INNER JOIN tags
        ON tags.id = session_tags.tag_id
        AND tags.deleted_at IS NULL
      INNER JOIN sessions
        ON sessions.id = session_tags.session_id
        AND sessions.deleted_at IS NULL
      WHERE session_tags.deleted_at IS NULL
      GROUP BY tags.id
      ORDER BY note_count DESC, tags.name
    `,
    mapRows: (rows) =>
      rows.map((row) => ({ name: row.name, count: Number(row.note_count) })),
  });
  return data;
}

export function addSessionTag(sessionId: string, tagName: string) {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await commands.addSessionTag({
      session_id: sessionId,
      tag_name: tagName,
    });
    if (result.status === "error") throw new Error(result.error);
    return result.data;
  });
}

export function removeSessionTag(sessionId: string, tagName: string) {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await commands.removeSessionTag({
      session_id: sessionId,
      tag_name: tagName,
    });
    if (result.status === "error") throw new Error(result.error);
  });
}

export function sameTag(left: string, right: string) {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}
