export enum MeetingPhase {
  Lobby = "lobby",
  Joining = "joining",
  InMeeting = "in_meeting",
  Reconnecting = "reconnecting",
  Ended = "ended",
  Unknown = "unknown",
}

function visible(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

export function meetPhase(document: Document): MeetingPhase {
  const buttons = [
    ...document.querySelectorAll('button, [role="button"]'),
  ].filter(visible);
  const leave = buttons.find((button) => {
    const label =
      button.getAttribute("aria-label") ??
      button.getAttribute("data-tooltip") ??
      "";
    return (
      /^(leave call|leave meeting|مغادرة المكالمة|مغادرة الاجتماع|quitter l'appel|quitter la réunion|anruf verlassen|llamada.*salir|salir de la llamada)(\b|$)/i.test(
        label,
      ) ||
      [...button.querySelectorAll("i, span, [data-icon]")].some(
        (icon) =>
          icon.getAttribute("data-icon") === "call_end" ||
          icon.textContent?.trim() === "call_end",
      )
    );
  });
  const notices = [
    ...document.querySelectorAll('[role="alert"], [role="status"], h1, h2'),
  ]
    .filter(visible)
    .map((element) => element.textContent?.trim() ?? "")
    .join("\n");
  if (
    /you (left|have been removed|were removed)|meeting (has )?ended|تمت إزالتك|لقد غادرت|انتهى الاجتماع/i.test(
      notices,
    )
  )
    return MeetingPhase.Ended;
  if (
    /reconnecting|connection (lost|interrupted)|إعادة الاتصال|انقطع الاتصال/i.test(
      notices,
    )
  )
    return MeetingPhase.Reconnecting;
  if (leave && !(leave as HTMLButtonElement).disabled)
    return MeetingPhase.InMeeting;
  if (/asking to join|waiting (for|to)|طلب الانضمام.*جار|بانتظار/i.test(notices))
    return MeetingPhase.Joining;
  if (
    buttons.some((button) =>
      /^(join now|ask to join|join meeting|الانضمام الآن|طلب الانضمام|rejoindre|jetzt teilnehmen)$/i.test(
        button.textContent?.trim() ?? "",
      ),
    )
  )
    return MeetingPhase.Lobby;
  return MeetingPhase.Unknown;
}
