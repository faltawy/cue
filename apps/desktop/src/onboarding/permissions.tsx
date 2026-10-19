import { useLingui } from "@lingui/react/macro";
import { useRef } from "react";

import { type PermissionStatus } from "@anlg/plugin-permissions";
import {
  ArrowRight,
  Check,
  Cursor,
  type Icon,
  Microphone,
  SpeakerHigh,
} from "@anlg/ui/components/icons";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";
import { cn } from "@anlg/utils";

import {
  closePermissionAssistant,
  usePermission,
  usePermissionGuidance,
} from "~/shared/hooks/usePermissions";

function PermissionBlock({
  enabledLabel,
  enableLabel,
  enabledBody,
  enableBody,
  Icon,
  permissionName,
  status,
  isPending,
  onAction,
  actionLabel,
  assisted = false,
  opensSettingsWhenDenied = true,
}: {
  enabledLabel: string;
  enableLabel: string;
  enabledBody: string;
  enableBody: string;
  Icon: Icon;
  permissionName: string;
  status: PermissionStatus | undefined;
  isPending: boolean;
  onAction: () => void;
  actionLabel?: string;
  assisted?: boolean;
  opensSettingsWhenDenied?: boolean;
}) {
  const { t } = useLingui();
  const isAuthorized = status === "authorized";
  const opensSettings =
    isAuthorized ||
    assisted ||
    (opensSettingsWhenDenied && status === "denied");
  const title = isAuthorized ? enabledLabel : enableLabel;
  const body = isAuthorized ? enabledBody : enableBody;

  return (
    <button
      type="button"
      onClick={onAction}
      disabled={isPending || isAuthorized}
      title={body}
      className={cn([
        "group flex w-full min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-2 text-start transition-[background-color,opacity] duration-100",
        isAuthorized
          ? "border-border bg-background"
          : "border-primary bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
        (isPending || isAuthorized) && "cursor-default",
        isPending && "opacity-50",
      ])}
      aria-label={
        opensSettings
          ? t`Open ${permissionName.toLowerCase()} settings`
          : (actionLabel ?? t`Enable ${permissionName.toLowerCase()}`)
      }
    >
      <div
        className={cn([
          "flex size-4 shrink-0 items-center justify-center",
          isAuthorized ? "text-success" : "text-primary-foreground",
        ])}
      >
        {isAuthorized ? (
          <Check className="size-3.5" />
        ) : (
          <Icon className="size-3.5" />
        )}
      </div>
      <span
        className={cn([
          "text-ui min-w-0 flex-1 truncate font-medium",
          isAuthorized ? "text-foreground" : "text-primary-foreground",
        ])}
      >
        {title}
      </span>
      {!isAuthorized && (
        <ArrowRight
          className="text-primary-foreground/70 size-3.5 shrink-0 rtl:rotate-180"
          data-testid="permission-action-arrow"
        />
      )}
    </button>
  );
}

function ContinueWhenComplete({
  onContinue,
  hasContinuedRef,
}: {
  onContinue?: () => void;
  hasContinuedRef: { current: boolean };
}) {
  useMountEffect(() => {
    if (hasContinuedRef.current) return;
    hasContinuedRef.current = true;
    onContinue?.();
  });

  return null;
}

function PermissionsSectionContent({
  onContinue,
  accessibility,
  accessibilityGuidance,
}: {
  onContinue?: () => void;
  accessibility: ReturnType<typeof usePermission>;
  accessibilityGuidance: ReturnType<typeof usePermissionGuidance>;
}) {
  const { t } = useLingui();
  const mic = usePermission("microphone");
  const systemAudio = usePermission("systemAudio");
  const hasContinuedRef = useRef(false);

  const isComplete =
    mic.status === "authorized" &&
    systemAudio.status === "authorized" &&
    accessibility.status === "authorized";

  const handleAction = (
    perm: ReturnType<typeof usePermission>,
    opensSettingsWhenDenied: boolean,
    assisted = false,
  ) => {
    // Assisted panes are granted by hand in System Settings; their request API
    // only prompts once, so every click after that would be a silent no-op.
    if (assisted || (opensSettingsWhenDenied && perm.status === "denied")) {
      perm.open();
    } else {
      perm.request();
    }
  };

  return (
    <div>
      {isComplete && (
        <ContinueWhenComplete
          onContinue={onContinue}
          hasContinuedRef={hasContinuedRef}
        />
      )}

      <div className="flex flex-col gap-2">
        <PermissionBlock
          enabledLabel={t`Cue can hear your voice`}
          enableLabel={t`Help Cue listen to you`}
          enabledBody={t`Microphone access turned on`}
          enableBody={mic.error ?? t`Use your microphone to capture your voice`}
          Icon={Microphone}
          permissionName={t`Microphone`}
          status={mic.status}
          isPending={mic.isPending}
          onAction={() => handleAction(mic, true)}
          opensSettingsWhenDenied
        />

        <PermissionBlock
          enabledLabel={t`Cue can hear others`}
          enableLabel={t`Help Cue listen to others`}
          enabledBody={t`System audio enabled`}
          enableBody={
            systemAudio.error ?? t`Use system audio to capture other speakers`
          }
          Icon={SpeakerHigh}
          permissionName={t`System audio`}
          status={systemAudio.status}
          isPending={systemAudio.isPending}
          onAction={() => handleAction(systemAudio, true)}
          opensSettingsWhenDenied
        />

        <PermissionBlock
          enabledLabel={t`Cue can read meeting details`}
          enableLabel={t`Help Cue read meeting activity`}
          enabledBody={t`Meeting details access turned on`}
          enableBody={
            accessibilityGuidance
              ? t`Opens System Settings and guides you to add Cue to the ${accessibilityGuidance.paneTitle ?? "Privacy"} list`
              : t`Read meeting controls and visible chat`
          }
          Icon={Cursor}
          permissionName={t`Accessibility`}
          status={accessibility.status}
          isPending={accessibility.isPending}
          onAction={() =>
            handleAction(accessibility, false, Boolean(accessibilityGuidance))
          }
          assisted={Boolean(accessibilityGuidance)}
          opensSettingsWhenDenied={false}
        />
      </div>
    </div>
  );
}

export function PermissionsSection({
  onContinue,
}: {
  onContinue?: () => void;
}) {
  const accessibility = usePermission("accessibility");
  const accessibilityGuidance = usePermissionGuidance("accessibility");

  // Leaving onboarding while the assistant is up would strand its overlay on
  // top of System Settings with nothing left to dismiss it.
  useMountEffect(() => () => void closePermissionAssistant());

  return (
    <PermissionsSectionContent
      onContinue={onContinue}
      accessibility={accessibility}
      accessibilityGuidance={accessibilityGuidance}
    />
  );
}
