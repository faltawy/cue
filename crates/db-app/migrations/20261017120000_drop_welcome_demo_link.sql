UPDATE sessions
SET
  event_json = CASE
    WHEN json_extract(event_json, '$.description') = 'A private, prerecorded introduction to Anarlog.'
    THEN json_remove(event_json, '$.meeting_link', '$.description')
    ELSE json_remove(event_json, '$.meeting_link')
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE CASE
  WHEN json_valid(event_json)
  THEN json_extract(event_json, '$.tracking_id') = 'anarlog-onboarding-demo-v1'
    AND json_extract(event_json, '$.meeting_link') = 'https://anarlog.so/onboarding-demo/'
  ELSE 0
END;
