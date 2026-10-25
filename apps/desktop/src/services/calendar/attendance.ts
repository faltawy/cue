import { AttendanceSelfStatus, AttendanceRosterStatus } from "~/services/enums";
export type EventAttendanceSnapshotV1 = {
  version: 1;
  self_status: AttendanceSelfStatus;
  roster_status: AttendanceRosterStatus;
  others: {
    accepted: number;
    tentative: number;
    pending: number;
    declined: number;
    unknown: number;
  };
  observed_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseSnapshot(value: unknown): EventAttendanceSnapshotV1 | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const selfStatus = Object.values(AttendanceSelfStatus).find(
    (status) => status === value.self_status,
  );
  const rosterStatus = Object.values(AttendanceRosterStatus).find(
    (status) => status === value.roster_status,
  );
  if (!selfStatus || !rosterStatus) return null;
  if (!isRecord(value.others)) return null;
  if (
    !isCount(value.others.accepted) ||
    !isCount(value.others.tentative) ||
    !isCount(value.others.pending) ||
    !isCount(value.others.declined) ||
    !isCount(value.others.unknown)
  ) {
    return null;
  }
  if (
    typeof value.observed_at !== "string" ||
    !Number.isFinite(Date.parse(value.observed_at))
  ) {
    return null;
  }

  return {
    version: 1,
    self_status: selfStatus,
    roster_status: rosterStatus,
    others: {
      accepted: value.others.accepted,
      tentative: value.others.tentative,
      pending: value.others.pending,
      declined: value.others.declined,
      unknown: value.others.unknown,
    },
    observed_at: value.observed_at,
  };
}

export function createAttendanceSnapshot(
  attendance: unknown,
  observedAt: Date,
): EventAttendanceSnapshotV1 | null {
  if (!isRecord(attendance)) return null;

  return parseSnapshot({
    version: 1,
    self_status: attendance.self_status,
    roster_status: attendance.roster_status,
    others: attendance.others,
    observed_at: observedAt.toISOString(),
  });
}

export function encodeAttendanceSnapshot(
  snapshot: EventAttendanceSnapshotV1 | null | undefined,
): string | null {
  return snapshot ? JSON.stringify(snapshot) : null;
}

export function parseAttendanceSnapshot(
  value: string | null | undefined,
): EventAttendanceSnapshotV1 | null {
  if (!value) return null;

  try {
    return parseSnapshot(JSON.parse(value));
  } catch {
    return null;
  }
}
