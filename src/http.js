import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

export function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      details
    }
  });
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Malformed JSON body");
    error.statusCode = 400;
    error.code = "invalid_json";
    throw error;
  }
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function setCookie(res, name, value, options = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (options.maxAge !== undefined) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function serveStatic(req, res, publicDir) {
  const rawPath = new URL(req.url, "http://localhost").pathname;
  const requested = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(publicDir, safePath));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) return false;
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(res);
  return true;
}
