import { commands as coachCommands } from "@anlg/plugin-coach";

export async function showCoach() {
  const result = await coachCommands.show();
  if (result.status === "error") {
    console.error("[coach] failed to open", result.error);
  }
}

export async function showCoachForRecording() {
  const result = await coachCommands.showForRecording();
  if (result.status === "error") {
    console.error("[coach] failed to open for the recording", result.error);
  }
}
