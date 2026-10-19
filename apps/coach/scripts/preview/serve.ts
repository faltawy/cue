import { createAccess, loginUrl, randomToken, TOKEN_ENV, withAccess } from "../../src/access";
import { imageHeaders, resolveImageFile } from "../../src/files";
import page from "./index.html";

const project = process.env.PREVIEW_PROJECT ?? process.cwd();
const port = Number(process.env.PORT ?? 4790);
const access = createAccess(process.env[TOKEN_ENV] || randomToken(), port);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  routes: withAccess(access, page, {
    "/file": (request) => {
      const image = resolveImageFile(new URL(request.url).searchParams.get("path") ?? "", project, [project]);
      if (!image.ok) return new Response(image.reason, { status: image.status });
      return new Response(Bun.file(image.file), { headers: imageHeaders(image.type) });
    },
  }),
});

console.error(`coach preview: http://${server.hostname}:${server.port}/?state=conversation`);
console.error(`sign in once for project images (single use, 60s): ${loginUrl(access, "/?state=rich")}`);
