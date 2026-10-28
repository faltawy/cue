import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { nativeMessages } from "./native-messaging";

const frame = (value: string) => {
  const body = Buffer.from(value);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
};

async function* chunks(...values: Uint8Array[]) {
  yield* values;
}

test("native framing survives split headers, UTF-8 and coalesced messages without relaying malformed JSON", async () => {
  const bytes = Buffer.concat([
    frame(JSON.stringify({ text: "مرحبا" })),
    frame("{"),
    frame(JSON.stringify({ text: "next" })),
  ]);
  const output: unknown[] = [];
  await nativeMessages(
    chunks(bytes.subarray(0, 2), bytes.subarray(2, 9), bytes.subarray(9)),
    async (data) => {
      const framed = Buffer.from(data);
      expect(framed.readUInt32LE(0)).toBe(framed.length - 4);
      output.push(JSON.parse(framed.subarray(4).toString("utf8")));
    },
    async (message) => ({ echoed: message }),
  );
  expect(output).toEqual([
    { echoed: { text: "مرحبا" } },
    {
      version: 1,
      request_id: "",
      result: { status: "error", error: "invalid_message" },
    },
    { echoed: { text: "next" } },
  ]);
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(768 * 1024 + 1);
  await rejects(
    nativeMessages(
      chunks(oversized),
      async () => {},
      async () => {
        throw new Error("must reject length before relay");
      },
    ),
    /Invalid native message length/,
  );
  await rejects(
    nativeMessages(
      chunks(frame("{}").subarray(0, 5)),
      async () => {},
      async () => ({}),
    ),
    /Truncated native message/,
  );
});
