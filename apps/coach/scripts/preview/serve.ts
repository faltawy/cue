import page from "./index.html";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4790),
  routes: { "/": page },
});

console.error(`coach preview: http://${server.hostname}:${server.port}/?state=conversation`);
