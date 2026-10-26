import OWNER_USER_SQL from "../../../../crates/db-app/sql/owner-user.sql?raw";

import { useLiveQuery } from "~/db";
import { DEFAULT_USER_ID } from "~/shared/utils";

type OwnerUserSqlRow = {
  user_id: string;
};

export function useOwnerUserId(): string | null {
  const { data } = useLiveQuery<OwnerUserSqlRow, string>({
    sql: OWNER_USER_SQL,
    mapRows: (rows) => rows[0]?.user_id.trim() || DEFAULT_USER_ID,
  });
  return data ?? null;
}
