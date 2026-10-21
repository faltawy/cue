import { useLiveQuery } from "~/db";

export type HomeRecentNote = { id: string; title: string; created_at: string };
export type HomeFollowUp = {
  id: string;
  session_id: string;
  session_title: string;
  text: string;
};

const EMPTY_NOTES: HomeRecentNote[] = [];
const EMPTY_FOLLOW_UPS: HomeFollowUp[] = [];

export function useHomeRecentNotes(): HomeRecentNote[] {
  const { data = EMPTY_NOTES } = useLiveQuery<HomeRecentNote, HomeRecentNote[]>(
    {
      sql: `
      SELECT id, COALESCE(NULLIF(trim(title), ''), 'Untitled') AS title, created_at
      FROM sessions
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 3
    `,
    },
  );
  return data;
}

export function useHomeOpenFollowUps(): HomeFollowUp[] {
  const { data = EMPTY_FOLLOW_UPS } = useLiveQuery<
    HomeFollowUp,
    HomeFollowUp[]
  >({
    sql: `
      SELECT
        action_items.id,
        action_items.session_id,
        COALESCE(NULLIF(trim(sessions.title), ''), 'Untitled') AS session_title,
        action_items.text
      FROM action_items
      INNER JOIN sessions
        ON sessions.id = action_items.session_id
        AND sessions.deleted_at IS NULL
      WHERE action_items.deleted_at IS NULL
        AND action_items.status <> 'done'
        AND trim(action_items.text) <> ''
      ORDER BY
        CASE WHEN action_items.due_at = '' THEN 1 ELSE 0 END,
        action_items.due_at,
        action_items.created_at DESC,
        action_items.id
      LIMIT 3
    `,
  });
  return data;
}
