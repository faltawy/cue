import { expect, test } from "bun:test";

import { createAccess, type Handler, withAccess } from "./access";
import { BridgeError } from "./app-bridge";
import { dictationHandler } from "./dictation";

const recordingId = "4dc5a2a6-e74e-40ac-b36b-40741ee77e1c";

test("dictation requires coach authentication, validates input, and forwards native errors", async () => {
  const access = createAccess("secret", 4747);
  const route = withAccess(access, null, {
    "/dictation": {
      POST: dictationHandler({
        async dictation(id, action) {
          if (action === "start")
            throw new BridgeError(409, "Another recording is active.");
          return {
            text: id === recordingId ? "Recognized words" : "Wrong recording",
          };
        },
      }),
    },
  })["/dictation"] as { POST: Handler };
  const request = (body: unknown, authenticated = true) =>
    new Request("http://127.0.0.1:4747/dictation", {
      method: "POST",
      headers: {
        host: "127.0.0.1:4747",
        ...(authenticated ? { authorization: "Bearer secret" } : {}),
      },
      body: JSON.stringify(body),
    });
  const body = { recording_id: recordingId, action: "stop" };
  expect((await route.POST(request(body, false))).status).toBe(401);
  const success = await route.POST(request(body));
  expect(success.status).toBe(200);
  expect(await success.json()).toEqual({ text: "Recognized words" });
  expect(
    (await route.POST(request({ ...body, recording_id: "invalid" }))).status,
  ).toBe(400);
  expect(
    (await route.POST(request({ ...body, action: "listen" }))).status,
  ).toBe(400);
  const conflict = await route.POST(request({ ...body, action: "start" }));
  expect(conflict.status).toBe(409);
  expect(await conflict.text()).toBe("Another recording is active.");
  const unavailable = await dictationHandler(null)(request(body));
  expect(unavailable.status).toBe(503);
});
