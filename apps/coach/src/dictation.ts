import { z } from "zod";

import { type AppBridge, BridgeError } from "./app-bridge";

const inputSchema = z.object({
  recording_id: z.uuid(),
  action: z.enum(["start", "stop", "cancel"]),
});

export function dictationHandler(bridge: Pick<AppBridge, "dictation"> | null) {
  return async (request: Request): Promise<Response> => {
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return new Response(
        "Dictation needs a recording ID and start, stop, or cancel action.",
        { status: 400 },
      );
    if (!bridge)
      return new Response("Open the coach from Cue to use dictation.", {
        status: 503,
      });
    try {
      return Response.json(
        await bridge.dictation(input.data.recording_id, input.data.action),
      );
    } catch (error) {
      return new Response(
        error instanceof BridgeError
          ? error.message
          : "Cue could not complete dictation. Try again.",
        {
          status:
            error instanceof BridgeError &&
            error.status >= 400 &&
            error.status <= 599
              ? error.status
              : 502,
        },
      );
    }
  };
}
