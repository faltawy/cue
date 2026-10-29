import { afterAll, describe, expect, test } from "bun:test";

import {
  type Access,
  authorize,
  redeemCode,
  accessRoutes,
  CODE_TTL_MS,
  createAccess,
  secure,
  SESSION_COOKIE,
  signCode,
} from "./access";

const TOKEN =
  "f3b1c9d2e8a74b0c9d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c";
const OTHER =
  "0000000000000000000000000000000000000000000000000000000000000000";

const ok = () => new Response("ok");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(null, { status: 404 }),
});
afterAll(() => server.stop(true));

if (server.port === undefined) throw new Error("the test server has no port");
const access: Access = createAccess(TOKEN, server.port);
server.reload({
  fetch: () => new Response(null, { status: 404 }),
  routes: {
    "/": () => new Response("page"),
    ...accessRoutes(access),
    ...secure(access, {
      "/events": () =>
        new Response("data: {}\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      "/ask": { POST: ok },
      "/file": { GET: ok },
      "/open": { POST: ok },
    }),
  },
});

const base = `http://127.0.0.1:${server.port}`;
const origin = base;

function call(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

async function sessionCookie(): Promise<string> {
  const code = signCode(
    TOKEN,
    Date.now() + CODE_TTL_MS,
    crypto.randomUUID().replaceAll("-", ""),
  );
  const response = await call(`/auth?code=${encodeURIComponent(code)}`);
  const cookie = response.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0] ?? "";
}

const ENDPOINTS: Array<[string, string, string]> = [
  ["SSE", "GET", "/events"],
  ["POST", "POST", "/ask"],
  ["file", "GET", "/file?path=docs%2Fflow.png"],
  ["open", "POST", "/open"],
];

describe("every coach endpoint needs the launch secret", () => {
  test.each(ENDPOINTS)(
    "%s without credentials is 401",
    async (_kind, method, path) => {
      const response = await call(path, { method, headers: { origin } });
      expect(response.status).toBe(401);
    },
  );

  test.each(ENDPOINTS)(
    "%s with the wrong token or a forged cookie is 401",
    async (_kind, method, path) => {
      expect(
        (
          await call(path, {
            method,
            headers: { authorization: `Bearer ${OTHER}` },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call(path, {
            method,
            headers: {
              origin,
              cookie: `${SESSION_COOKIE}_${access.port}=${OTHER}`,
            },
          })
        ).status,
      ).toBe(401);
    },
  );

  test.each(ENDPOINTS)(
    "%s with the token or the session cookie is allowed",
    async (_kind, method, path) => {
      expect(
        (
          await call(path, {
            method,
            headers: { authorization: `Bearer ${TOKEN}` },
          })
        ).status,
      ).toBe(200);
      const cookie = await sessionCookie();
      expect(
        (await call(path, { method, headers: { origin, cookie } })).status,
      ).toBe(200);
    },
  );

  test("a request for another host name is refused even with the token (DNS rebinding)", async () => {
    for (const [, method, path] of ENDPOINTS) {
      const response = await call(path, {
        method,
        headers: {
          host: `evil.example.com:${server.port}`,
          authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(response.status).toBe(403);
    }
    expect(
      (
        await call("/events", {
          headers: {
            host: `localhost:${server.port}`,
            authorization: `Bearer ${TOKEN}`,
          },
        })
      ).status,
    ).toBe(200);
  });

  test("a page on another origin can't drive the coach with the user's cookie", async () => {
    const cookie = await sessionCookie();
    const evil = await call("/ask", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example.com" },
    });
    expect(evil.status).toBe(403);
    const otherPort = await call("/open", {
      method: "POST",
      headers: { cookie, origin: "http://127.0.0.1:1" },
    });
    expect(otherPort.status).toBe(403);
    const noOrigin = await call("/ask", {
      method: "POST",
      headers: { cookie },
    });
    expect(noOrigin.status).toBe(403);
    const crossSiteRead = await call("/file?path=a.png", {
      headers: { cookie, "sec-fetch-site": "cross-site" },
    });
    expect(crossSiteRead.status).toBe(403);
    const sameOrigin = await call("/ask", {
      method: "POST",
      headers: { cookie, origin, "sec-fetch-site": "same-origin" },
    });
    expect(sameOrigin.status).toBe(200);
    const fetchMetadataOnly = await call("/ask", {
      method: "POST",
      headers: { cookie, "sec-fetch-site": "same-origin" },
    });
    expect(fetchMetadataOnly.status).toBe(200);
  });

  test("responses carry no CORS permission", async () => {
    const response = await call("/events", {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: "https://evil.example.com",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await call("/ask", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("signing the coach window in", () => {
  test("a fresh signed code sets an HttpOnly, SameSite=Strict session cookie once and sends the window to the page", async () => {
    const code = signCode(
      TOKEN,
      Date.now() + CODE_TTL_MS,
      "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
    );
    const first = await call(
      `/auth?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/?state=rich")}`,
    );
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("/?state=rich");
    const cookie = first.headers.get("set-cookie") ?? "";
    expect(cookie).toStartWith(`${SESSION_COOKIE}_${access.port}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain(TOKEN);
    expect((await call(`/auth?code=${encodeURIComponent(code)}`)).status).toBe(
      401,
    );
  });

  test.each([
    [
      "expired",
      () => signCode(TOKEN, Date.now() - 1, "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"),
    ],
    [
      "signed with another secret",
      () =>
        signCode(
          OTHER,
          Date.now() + CODE_TTL_MS,
          "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
        ),
    ],
    [
      "too far in the future",
      () =>
        signCode(
          TOKEN,
          Date.now() + 10 * CODE_TTL_MS,
          "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
        ),
    ],
    ["malformed", () => "not-a-code"],
  ])("refuses a code that is %s", async (_name, make) => {
    const response = await call(`/auth?code=${encodeURIComponent(make())}`);
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("only redirects inside the coach", async () => {
    const code = signCode(
      TOKEN,
      Date.now() + CODE_TTL_MS,
      "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
    );
    const response = await call(
      `/auth?code=${encodeURIComponent(code)}&next=${encodeURIComponent("//evil.example.com")}`,
    );
    expect(response.headers.get("location")).toBe("/");
  });

  test("codes match the app's signer byte for byte", () => {
    expect(
      signCode("secret", 1_760_000_000_000, "00112233445566778899aabbccddeeff"),
    ).toBe(
      "1760000000000.00112233445566778899aabbccddeeff.4f8972c0ce6e10c7bf42ef07364e3cdd8c27e5473f2c88beb6a85f8c6907e79c",
    );
  });
});

test("opening a second assistant window preserves both sidecar sessions", async () => {
  const first = await sessionCookie();
  expect(
    (await call("/ask", { method: "POST", headers: { origin, cookie: first } }))
      .status,
  ).toBe(200);
  const secondAccess = createAccess(OTHER, access.port + 1);
  const secondOrigin = `http://127.0.0.1:${secondAccess.port}`;
  const code = signCode(
    OTHER,
    Date.now() + CODE_TTL_MS,
    crypto.randomUUID().replaceAll("-", ""),
  );
  const login = redeemCode(
    new Request(`${secondOrigin}/auth?code=${code}`, {
      headers: { host: `127.0.0.1:${secondAccess.port}` },
    }),
    secondAccess,
  );
  const second = login.headers.get("set-cookie")!.split(";")[0]!;
  const jar = new Map<string, string>();
  for (const cookie of [first, second]) {
    const [name, value] = cookie.split("=");
    jar.set(name!, value!);
  }
  const cookies = [...jar]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  expect(
    (
      await call("/ask", {
        method: "POST",
        headers: { origin, cookie: cookies },
      })
    ).status,
  ).toBe(200);
  expect(
    authorize(
      new Request(`${secondOrigin}/ask`, {
        method: "POST",
        headers: {
          host: `127.0.0.1:${secondAccess.port}`,
          origin: secondOrigin,
          cookie: cookies,
        },
      }),
      secondAccess,
    ),
  ).toBeNull();
});

test("async meeting alignment completes before serving the authenticated chat stream", async () => {
  const scoped = createAccess(TOKEN, server.port!);
  let selected = "previous";
  scoped.check = async (request) => {
    await Promise.resolve();
    if (request.headers.get("x-cue-browser-session") !== "current")
      return new Response("meeting mismatch", { status: 409 });
    selected = "current";
    return null;
  };
  const routes = secure(scoped, {
    "/events": () => new Response(`data: ${selected}\n\n`),
  });
  const handler = routes["/events"];
  if (typeof handler !== "function") throw new Error("missing events handler");
  const current = await handler(
    new Request(`${base}/events`, {
      headers: {
        host: `127.0.0.1:${server.port}`,
        authorization: `Bearer ${TOKEN}`,
        "x-cue-browser-session": "current",
      },
    }),
  );
  expect(await current.text()).toBe("data: current\n\n");
  const other = await handler(
    new Request(`${base}/events`, {
      headers: {
        host: `127.0.0.1:${server.port}`,
        authorization: `Bearer ${TOKEN}`,
        "x-cue-browser-session": "another",
      },
    }),
  );
  expect(other.status).toBe(409);
  const unauthorized = await handler(
    new Request(`${base}/events`, {
      headers: {
        host: `127.0.0.1:${server.port}`,
        authorization: `Bearer ${OTHER}`,
        "x-cue-browser-session": "current",
      },
    }),
  );
  expect(unauthorized.status).toBe(401);
});
