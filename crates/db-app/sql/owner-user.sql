SELECT
  user_id
FROM
  (
    SELECT
      owner_user_id AS user_id,
      updated_at,
      0 AS source_priority
    FROM
      sessions
    WHERE
      owner_user_id <> ''
      AND deleted_at IS NULL
    UNION
    ALL
    SELECT
      id AS user_id,
      updated_at,
      1 AS source_priority
    FROM
      humans
    WHERE
      id = owner_user_id
      AND id <> ''
      AND deleted_at IS NULL
    UNION
    ALL
    SELECT
      owner_user_id AS user_id,
      updated_at,
      2 AS source_priority
    FROM
      chat_groups
    WHERE
      owner_user_id <> ''
      AND deleted_at IS NULL
  )
ORDER BY
  source_priority,
  updated_at DESC,
  user_id
LIMIT
  1
