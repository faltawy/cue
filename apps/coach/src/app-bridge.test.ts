import { afterEach, describe, expect, test } from "bun:test";

import { appBridge, BridgeError } from "./app-bridge";

type Seen = { method: string; path: string; auth: string | null; body: unknown };

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => server?.stop(true));

function fakeApp(reply: (seen: Seen) => Response) {
  const seen: Seen[] = [];
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const text = await request.text();
      const entry = {
        method: request.method,
        path: new URL(request.url).pathname,
        auth: request.headers.get("authorization"),
        body: text ? JSON.parse(text) : undefined,
      };
      seen.push(entry);
      return reply(entry);
    },
  });
  return { seen, bridge: appBridge(`http://localhost:${server.port}`, "secret") };
}

const edit = (kind: string) => ({
  id: "e1",
  session_id: "m1",
  kind,
  summary: "Created note “Pricing”",
  task_id: null,
  target_id: "n1",
});

describe("library bridge calls", () => {
  test("each change posts its payload to the app under the attached meeting", async () => {
    const { seen, bridge } = fakeApp(() => Response.json({ edit: edit("create_note"), id: "n1", message: "ok" }));

    await bridge.createNote("m1", { title: "Pricing", folder: "Clients", content_markdown: "- a" });
    await bridge.updateNote("m1", "n 1", { title: "New", add_tags: ["x"], remove_tags: [] });
    await bridge.createFolder("m1", "Clients/Lumen");
    await bridge.createPerson("m1", { name: "Sara", email: "sara@lumen.test", organization: "Lumen", create_organization: true });
    await bridge.updatePerson("m1", "sara", { job_title: "CFO" });
    await bridge.createOrganization("m1", { name: "Lumen" });
    await bridge.updateOrganization("m1", "org", { memo: "key account" });
    await bridge.addParticipant("m1", { person_id: "sara" });
    await bridge.createTemplate("m1", { title: "Discovery", sections: [{ title: "Pain", description: "What hurts" }] });
    await bridge.updateTemplate("m1", "tpl", { description: "First call" });

    expect(seen.map(({ method, path, body }) => [method, path, body])).toEqual([
      ["POST", "/meeting/m1/library/notes", { title: "Pricing", folder: "Clients", content_markdown: "- a" }],
      ["POST", "/meeting/m1/library/notes/n%201", { title: "New", add_tags: ["x"], remove_tags: [] }],
      ["POST", "/meeting/m1/library/folders", { path: "Clients/Lumen" }],
      ["POST", "/meeting/m1/library/people", { name: "Sara", email: "sara@lumen.test", organization: "Lumen", create_organization: true }],
      ["POST", "/meeting/m1/library/people/sara", { job_title: "CFO" }],
      ["POST", "/meeting/m1/library/organizations", { name: "Lumen" }],
      ["POST", "/meeting/m1/library/organizations/org", { memo: "key account" }],
      ["POST", "/meeting/m1/library/participants", { person_id: "sara" }],
      ["POST", "/meeting/m1/library/templates", { title: "Discovery", sections: [{ title: "Pain", description: "What hurts" }] }],
      ["POST", "/meeting/m1/library/templates/tpl", { description: "First call" }],
    ]);
    expect(seen.every((entry) => entry.auth === "Bearer secret")).toBe(true);
  });

  test("the app's answer is parsed, including a no-op without an edit", async () => {
    const { bridge } = fakeApp(({ path }) =>
      path.endsWith("folders")
        ? Response.json({ edit: null, id: "f1", message: "The folder Clients already exists" })
        : Response.json({ edit: edit("create_note"), id: "n1", message: "Created note “Pricing”" }),
    );

    expect(await bridge.createFolder("m1", "Clients")).toEqual({ edit: null, id: "f1", message: "The folder Clients already exists" });
    expect((await bridge.createNote("m1", { title: "Pricing" })).edit?.target_id).toBe("n1");
  });

  test("a refusal surfaces the app's message and status", async () => {
    const { bridge } = fakeApp(() => Response.json({ error: "this note is locked in the app" }, { status: 403 }));

    const refused = bridge.updateNote("m1", "secret", { title: "Peek" });

    expect(refused).rejects.toBeInstanceOf(BridgeError);
    expect(refused).rejects.toThrow("this note is locked in the app");
  });
});

describe("recording state", () => {
  test("the app names the meetings it is capturing", async () => {
    const { seen, bridge } = fakeApp(() => Response.json({ session_ids: ["m1"] }));

    expect(await bridge.recordingSessions()).toEqual(new Set(["m1"]));
    expect(seen.map(({ method, path }) => [method, path])).toEqual([["GET", "/recording"]]);
  });
});
