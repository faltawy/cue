import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_ENV = "ANARLOG_COACH_TOKEN";
export const SESSION_COOKIE = "coach_session";
export const CODE_TTL_MS = 60_000;

const READS = new Set(["GET", "HEAD"]);
const FETCH_SITES = new Set(["same-origin", "none"]);
const CODE = /^(\d{13})\.([0-9a-f]{32})\.([0-9a-f]{64})$/;

export type Access = { token: string; session: string; port: number; used: Set<string> };

export type Handler = (request: Request) => Response | Promise<Response>;
export type Route = Handler | Partial<Record<"GET" | "POST" | "PUT" | "DELETE", Handler>>;

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export function createAccess(token: string, port: number): Access {
  return { token, session: randomToken(), port, used: new Set() };
}

export function signCode(token: string, expiresMs: number, nonce: string): string {
  const signature = createHmac("sha256", token).update(`coach-auth:${expiresMs}:${nonce}`).digest("hex");
  return `${expiresMs}.${nonce}.${signature}`;
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function origins(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function refuse(status: 401 | 403, text: string): Response {
  return new Response(text, { status, headers: { "cache-control": "no-store" } });
}

function hostAllowed(request: Request, access: Access): boolean {
  return origins(access.port).includes(request.headers.get("host") ?? "");
}

export function authorize(request: Request, access: Access): Response | null {
  if (!hostAllowed(request, access)) return refuse(403, "Unknown host.");
  const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (bearer !== undefined) return same(bearer, access.token) ? null : refuse(401, "Sign in from Cue.");
  const session = cookieValue(request, SESSION_COOKIE);
  if (session === null || !same(session, access.session)) return refuse(401, "Open the coach from Cue.");
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && !FETCH_SITES.has(site)) return refuse(403, "Cross-site requests are refused.");
  if (READS.has(request.method)) return null;
  const origin = request.headers.get("origin");
  if (origin === null) return site === "same-origin" ? null : refuse(403, "Cross-origin requests are refused.");
  return origins(access.port).some((allowed) => origin === `http://${allowed}`)
    ? null
    : refuse(403, "Cross-origin requests are refused.");
}

function guard(access: Access, handler: Handler): Handler {
  return (request) => authorize(request, access) ?? handler(request);
}

export function secure(access: Access, routes: Record<string, Route>): Record<string, Route> {
  return Object.fromEntries(
    Object.entries(routes).map(([path, route]) => [
      path,
      typeof route === "function"
        ? guard(access, route)
        : Object.fromEntries(
            Object.entries(route).flatMap(([method, handler]) => (handler ? [[method, guard(access, handler)]] : [])),
          ),
    ]),
  );
}

function validCode(code: string, access: Access, now: number): boolean {
  const match = CODE.exec(code);
  if (!match) return false;
  const [, expires = "", nonce = ""] = match;
  const expiresMs = Number(expires);
  if (expiresMs < now || expiresMs > now + CODE_TTL_MS || access.used.has(nonce)) return false;
  if (!same(signCode(access.token, expiresMs, nonce), code)) return false;
  access.used.add(nonce);
  return true;
}

function nextPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export function redeemCode(request: Request, access: Access, now = Date.now()): Response {
  if (!hostAllowed(request, access)) return refuse(403, "Unknown host.");
  const params = new URL(request.url).searchParams;
  if (!validCode(params.get("code") ?? "", access, now)) return refuse(401, "This sign-in link has expired. Open the coach from Cue.");
  return new Response(null, {
    status: 303,
    headers: {
      location: nextPath(params.get("next")),
      "set-cookie": `${SESSION_COOKIE}=${access.session}; Path=/; HttpOnly; SameSite=Strict`,
      "cache-control": "no-store",
    },
  });
}

export function accessRoutes(access: Access): Record<string, Route> {
  return { "/auth": { GET: (request) => redeemCode(request, access) } };
}

export function withAccess<Page>(access: Access, page: Page, routes: Record<string, Route>): Record<string, Route | Page> {
  return { "/": page, ...accessRoutes(access), ...secure(access, routes) };
}

export function loginUrl(access: Access, next = "/"): string {
  const code = signCode(access.token, Date.now() + CODE_TTL_MS, randomBytes(16).toString("hex"));
  return `http://127.0.0.1:${access.port}/auth?code=${code}&next=${encodeURIComponent(next)}`;
}
