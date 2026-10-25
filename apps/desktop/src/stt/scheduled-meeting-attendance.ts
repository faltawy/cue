import { AttendanceRosterStatus, AttendanceSelfStatus } from "~/services/enums";
import { AutomaticMeetingBlockReason } from "~/stt/enums";

type AttendanceEligibilityBasis =
  | AttendanceSelfStatus.Organizer
  | AttendanceSelfStatus.Accepted;
import { parseAttendanceSnapshot } from "~/services/calendar/attendance";

export const ATTENDANCE_MAX_AGE_MS = 3 * 60_000;
export const ATTENDANCE_FUTURE_TOLERANCE_MS = 30_000;

export { AutomaticMeetingBlockReason };

export type AutomaticMeetingDecision =
  | { eligible: true; basis: AttendanceEligibilityBasis }
  | { eligible: false; reasons: AutomaticMeetingBlockReason[] };

export function decideAutomaticMeetingAttendance({
  attendanceJson,
  nowMs,
}: {
  attendanceJson: string | null;
  nowMs: number;
}): AutomaticMeetingDecision {
  const attendance = parseAttendanceSnapshot(attendanceJson);
  if (!attendance) {
    return {
      eligible: false,
      reasons: [
        attendanceJson
          ? AutomaticMeetingBlockReason.InvalidAttendance
          : AutomaticMeetingBlockReason.MissingAttendance,
      ],
    };
  }

  const observedAtMs = Date.parse(attendance.observed_at);
  if (!Number.isFinite(observedAtMs)) {
    return {
      eligible: false,
      reasons: [AutomaticMeetingBlockReason.InvalidAttendance],
    };
  }
  if (observedAtMs - nowMs > ATTENDANCE_FUTURE_TOLERANCE_MS) {
    return {
      eligible: false,
      reasons: [AutomaticMeetingBlockReason.FutureAttendance],
    };
  }
  if (nowMs - observedAtMs > ATTENDANCE_MAX_AGE_MS) {
    return {
      eligible: false,
      reasons: [AutomaticMeetingBlockReason.StaleAttendance],
    };
  }

  const reasons: AutomaticMeetingBlockReason[] = [];
  let basis: AttendanceEligibilityBasis | null = null;
  switch (attendance.self_status) {
    case AttendanceSelfStatus.Organizer:
    case AttendanceSelfStatus.Accepted:
      basis = attendance.self_status;
      break;
    case AttendanceSelfStatus.Declined:
      reasons.push(AutomaticMeetingBlockReason.SelfDeclined);
      break;
    case AttendanceSelfStatus.Tentative:
      reasons.push(AutomaticMeetingBlockReason.SelfTentative);
      break;
    case AttendanceSelfStatus.Pending:
      reasons.push(AutomaticMeetingBlockReason.SelfPending);
      break;
    case AttendanceSelfStatus.Unknown:
      reasons.push(AutomaticMeetingBlockReason.SelfUnknown);
      break;
  }

  const others = attendance.others;
  const otherCount =
    others.accepted +
    others.tentative +
    others.pending +
    others.declined +
    others.unknown;
  if (
    attendance.roster_status === AttendanceRosterStatus.Complete &&
    otherCount > 0 &&
    others.declined === otherCount
  ) {
    reasons.push(AutomaticMeetingBlockReason.AllOthersDeclined);
  }

  if (reasons.length > 0 || !basis) {
    return { eligible: false, reasons };
  }

  return { eligible: true, basis };
}
