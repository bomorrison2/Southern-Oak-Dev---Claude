const { createServer } = require("node:http");
const { createReadStream, existsSync, statSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3003);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function resolvePath(url) {
  const cleanPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const candidate = normalize(join(root, cleanPath === "/" ? "index.html" : cleanPath));

  if (!candidate.startsWith(root)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    return join(candidate, "index.html");
  }

  return candidate;
}

createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": types[extname(filePath).toLowerCase()] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Southern Oak Claude preview: http://localhost:${port}`);
});
