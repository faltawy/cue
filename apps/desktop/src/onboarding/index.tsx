import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { commands as sfxCommands } from "@anlg/plugin-sfx";
import { SpeakerHigh, SpeakerX } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";
import { cn } from "@anlg/utils";

import { CalendarSection } from "./calendar";
import { ClaudeSection } from "./claude";
import {
  getInitialStep,
  getNextStep,
  getPrevStep,
  getStepStatus,
} from "./config";
import { FinalDescription, FinalSection, finishOnboarding } from "./final";
import { PermissionsSection } from "./permissions";
import { OnboardingSection } from "./shared";

import { useClaudeSignIn } from "~/settings/claude/sign-in";
import { StandaloneWindowShell } from "~/shared/window-shell";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentOnboarding({
  tab: _tab,
}: {
  tab: Extract<Tab, { type: "onboarding" }>;
}) {
  const openCurrent = useTabs((state) => state.openCurrent);

  const handleFinish = useCallback(
    (sessionId: string) => {
      openCurrent({ type: "sessions", id: sessionId });
    },
    [openCurrent],
  );

  return <OnboardingScreen onFinish={handleFinish} />;
}

function OnboardingScreen({
  onFinish,
}: {
  onFinish: (sessionId: string) => void;
}) {
  return (
    <OnboardingScreenContent
      onFinish={onFinish}
      headerClassName="px-12 pt-4 pb-8"
      headerDragRegion
    />
  );
}

export function StandaloneOnboardingScreen({
  onFinish,
}: {
  onFinish: (sessionId: string) => void;
}) {
  return (
    <StandaloneWindowShell>
      <OnboardingScreenContent
        onFinish={onFinish}
        headerClassName="px-12 pt-4 pb-8"
        headerDragRegion
      />
    </StandaloneWindowShell>
  );
}

function OnboardingScreenContent({
  onFinish,
  headerClassName,
  headerDragRegion = false,
}: {
  onFinish: (sessionId: string) => void;
  headerClassName: string;
  headerDragRegion?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isMuted, setIsMuted] = useState(false);
  const [currentStep, setCurrentStep] = useState(getInitialStep);
  const onboardingVideoRef = useRef<HTMLVideoElement>(null);

  const claudeSignedIn = useClaudeSignIn().signedIn;
  const skipped = claudeSignedIn ? (["claude"] as const) : [];

  const goNext = () => {
    const next = getNextStep(currentStep, skipped);
    if (next) setCurrentStep(next);
  };

  const skipCurrentStep = goNext;

  const goBack = () => {
    const prev = getPrevStep(currentStep, skipped);
    if (prev) setCurrentStep(prev);
  };

  useMountEffect(() => {
    sfxCommands.play("BGM").catch(console.error);
    return () => {
      sfxCommands.stop("BGM").catch(console.error);
    };
  });

  useEffect(() => {
    sfxCommands.setVolume("BGM", isMuted ? 0 : 0.2).catch(console.error);
  }, [isMuted]);

  useMountEffect(() => {
    if (onboardingVideoRef.current) {
      onboardingVideoRef.current.playbackRate = 0.65;
    }
  });

  const handleFinish = useCallback(
    (sessionId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-needed"] });
      onFinish(sessionId);
    },
    [onFinish, queryClient],
  );

  return (
    <div className="bg-background relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        data-tauri-drag-region={headerDragRegion || undefined}
        className="relative z-30 flex h-12 shrink-0 items-center justify-end ps-12 pe-3"
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsMuted((prev) => !prev)}
          data-tauri-drag-region="false"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <SpeakerX /> : <SpeakerHigh />}
        </Button>
      </div>

      <div
        data-tauri-drag-region={headerDragRegion || undefined}
        className={cn([
          "relative z-10 flex shrink-0 items-center",
          headerClassName,
        ])}
      >
        <h1 className="text-foreground text-page-title">
          <Trans>Welcome to Cue</Trans>
        </h1>
      </div>

      <div className="scroll-fade-y relative z-10 flex-1 overflow-y-auto">
        <div className="flex items-start gap-10 px-12 pb-16">
          <div className="flex max-w-xl min-w-0 flex-1 flex-col gap-4">
            <OnboardingSection
              title={<Trans>Start with permissions</Trans>}
              completedTitle={<Trans>Permissions granted</Trans>}
              description={
                <Trans>
                  Cue needs microphone and system audio to transcribe your
                  meetings, plus Accessibility to read meeting controls, visible
                  chat.
                </Trans>
              }
              status={getStepStatus("permissions", currentStep)}
              skippable={false}
              onBack={goBack}
              onNext={goNext}
            >
              <PermissionsSection onContinue={goNext} />
            </OnboardingSection>

            <OnboardingSection
              title={<Trans>Connect calendar</Trans>}
              description={
                <Trans>
                  Cue will sync your calendar to get meeting reminders
                </Trans>
              }
              completedTitle={<Trans>Calendar connected</Trans>}
              status={getStepStatus("calendar", currentStep)}
              onBack={goBack}
              onNext={goNext}
              onSkip={skipCurrentStep}
            >
              <CalendarSection onContinue={goNext} />
            </OnboardingSection>

            <OnboardingSection
              title={<Trans>Sign in to Claude</Trans>}
              completedTitle={
                claudeSignedIn ? (
                  <Trans>Claude signed in</Trans>
                ) : (
                  <Trans>Claude sign-in skipped</Trans>
                )
              }
              description={
                <Trans>
                  Summaries and the coach run on Claude, using your Claude
                  sign-in on this Mac.
                </Trans>
              }
              status={getStepStatus("claude", currentStep)}
              onBack={goBack}
              onNext={goNext}
              onSkip={skipCurrentStep}
            >
              <ClaudeSection onContinue={goNext} />
            </OnboardingSection>

            <OnboardingSection
              title={<Trans>Ready to go</Trans>}
              description={<FinalDescription />}
              status={getStepStatus("final", currentStep)}
              skippable={false}
              onBack={goBack}
              onNext={() => void finishOnboarding(handleFinish)}
            >
              <FinalSection onContinue={handleFinish} />
            </OnboardingSection>
          </div>
          <div className="border-border sticky top-0 hidden aspect-[4/5] w-[min(40%,380px)] shrink-0 overflow-hidden rounded-lg border lg:block">
            <video
              ref={onboardingVideoRef}
              className="size-full object-cover object-bottom"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
            >
              <source src="/assets/onboarding-video.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </div>
  );
}
