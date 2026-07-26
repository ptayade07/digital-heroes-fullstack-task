import { createServer } from "node:http";
import { resolve } from "node:path";
import { COOKIE_NAME, LEAD_STATUSES, PORT, SESSION_TTL_MS } from "./config.js";
import { JsonStore } from "./store.js";
import { parseCookies, readJson, sendError, sendJson, serveStatic, setCookie } from "./http.js";
import { validateLeadPatch, validatePublicLead } from "./validation.js";

const publicDir = resolve(process.cwd(), "public");

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function canAccessLead(user, lead) {
  return user.role === "admin" || lead.assignedTo === user.id;
}

function getSessionUser(req, store) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return { user: null, session: null };
  const session = store.findSession(sessionId);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) store.deleteSession(sessionId);
    return { user: null, session: null };
  }
  return { user: store.findUserById(session.userId), session };
}

function requireAuth(req, res, store) {
  const { user, session } = getSessionUser(req, store);
  if (!user) {
    sendError(res, 401, "unauthorized", "Sign in required");
    return null;
  }
  return { user, session };
}

function normalizePagination(searchParams) {
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 10)));
  return { page, pageSize };
}

export function createApp({ store = new JsonStore() } = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        if (serveStatic(req, res, publicDir)) return;
      }

      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(req);
        const user = store.findUserByEmail(String(body.email || ""));
        if (!user || user.password !== body.password) {
          return sendError(res, 401, "invalid_credentials", "Email or password is incorrect");
        }
        const session = store.createSession(user.id, new Date(Date.now() + SESSION_TTL_MS).toISOString());
        setCookie(res, COOKIE_NAME, session.id, { maxAge: SESSION_TTL_MS / 1000 });
        return sendJson(res, 200, { user: sanitizeUser(user) });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        const { session } = getSessionUser(req, store);
        if (session) store.deleteSession(session.id);
        setCookie(res, COOKIE_NAME, "", { maxAge: 0 });
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/me") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        return sendJson(res, 200, { user: sanitizeUser(auth.user) });
      }

      if (req.method === "GET" && url.pathname === "/api/users") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        if (auth.user.role !== "admin") return sendError(res, 403, "forbidden", "Admins only");
        return sendJson(res, 200, { data: store.listUsers() });
      }

      if (req.method === "POST" && url.pathname === "/api/public/leads") {
        const body = await readJson(req);
        const validation = validatePublicLead(body);
        if (!validation.ok) return sendError(res, 422, "validation_error", "Lead submission is invalid", validation.details);
        const lead = store.createLead({
          name: String(body.name).trim(),
          email: String(body.email).trim(),
          company: String(body.company).trim(),
          source: String(body.source || "Website").trim(),
          message: String(body.message).trim()
        });
        return sendJson(res, 201, { data: lead });
      }

      if (req.method === "GET" && url.pathname === "/api/leads") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        const { page, pageSize } = normalizePagination(url.searchParams);
        const result = store.listLeads({
          user: auth.user,
          status: url.searchParams.get("status"),
          assignedTo: url.searchParams.get("assignedTo"),
          search: url.searchParams.get("search"),
          page,
          pageSize
        });
        return sendJson(res, 200, result);
      }

      const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadMatch && req.method === "GET") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        const lead = store.findLead(leadMatch[1]);
        if (!lead) return sendError(res, 404, "not_found", "Lead not found");
        if (!canAccessLead(auth.user, lead)) return sendError(res, 403, "forbidden", "You can only view assigned leads");
        return sendJson(res, 200, { data: lead });
      }

      if (leadMatch && req.method === "PATCH") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        const lead = store.findLead(leadMatch[1]);
        if (!lead) return sendError(res, 404, "not_found", "Lead not found");
        if (!canAccessLead(auth.user, lead)) return sendError(res, 403, "forbidden", "You can only update assigned leads");
        const body = await readJson(req);
        if (auth.user.role !== "admin" && body.assignedTo !== undefined) {
          return sendError(res, 403, "forbidden", "Only admins can assign leads");
        }
        const validation = validateLeadPatch(body, store.listUsers());
        if (!validation.ok) return sendError(res, 422, "validation_error", "Lead update is invalid", validation.details);
        const updated = store.updateLead(lead.id, validation.patch, auth.user.id);
        return sendJson(res, 200, { data: updated });
      }

      const noteMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
      if (noteMatch && req.method === "POST") {
        const auth = requireAuth(req, res, store);
        if (!auth) return;
        const lead = store.findLead(noteMatch[1]);
        if (!lead) return sendError(res, 404, "not_found", "Lead not found");
        if (!canAccessLead(auth.user, lead)) return sendError(res, 403, "forbidden", "You can only note assigned leads");
        const body = await readJson(req);
        if (!String(body.body || "").trim()) return sendError(res, 422, "validation_error", "Note body is required");
        const note = store.addNote(lead.id, auth.user.id, String(body.body).trim());
        return sendJson(res, 201, { data: note });
      }

      if (req.method === "GET" && url.pathname === "/api/meta") {
        return sendJson(res, 200, { statuses: LEAD_STATUSES });
      }

      sendError(res, 404, "not_found", "Route not found");
    } catch (error) {
      sendError(res, error.statusCode || 500, error.code || "internal_error", error.message || "Unexpected server error");
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.endsWith("\\server.js")) {
  createApp().listen(PORT, () => {
    console.log(`Lead platform running at http://localhost:${PORT}`);
  });
}
