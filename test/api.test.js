import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.js";
import { JsonStore } from "../src/store.js";

let server;
let baseUrl;
let tempDir;

function cookieFrom(response) {
  return response.headers.getSetCookie()[0].split(";")[0];
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  return { response, payload };
}

async function login(email, password) {
  const { response, payload } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200);
  return { cookie: cookieFrom(response), user: payload.user };
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "lead-platform-"));
  const store = new JsonStore(join(tempDir, "db.json"));
  server = createApp({ store });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tempDir, { recursive: true, force: true });
});

describe("auth", () => {
  it("rejects invalid credentials with structured error", async () => {
    const { response, payload } = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "wrong" })
    });
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "invalid_credentials");
  });

  it("returns current user for a valid session", async () => {
    const { cookie } = await login("admin@example.com", "admin123");
    const { response, payload } = await request("/api/me", { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(payload.user.role, "admin");
    assert.equal(payload.user.password, undefined);
  });
});

describe("lead lifecycle", () => {
  it("validates and creates a public lead", async () => {
    const bad = await request("/api/public/leads", {
      method: "POST",
      body: JSON.stringify({ name: "No Email" })
    });
    assert.equal(bad.response.status, 422);

    const good = await request("/api/public/leads", {
      method: "POST",
      body: JSON.stringify({
        name: "Priya Shah",
        email: "priya@example.com",
        company: "Bright Cart",
        message: "We need a new lead workflow."
      })
    });
    assert.equal(good.response.status, 201);
    assert.equal(good.payload.data.status, "new");
    assert.equal(good.payload.data.assignedTo, null);
  });

  it("supports pagination and filtering for admins", async () => {
    const { cookie } = await login("admin@example.com", "admin123");
    const { response, payload } = await request("/api/leads?page=1&pageSize=1&status=new", {
      headers: { cookie }
    });
    assert.equal(response.status, 200);
    assert.equal(payload.pageSize, 1);
    assert.ok(payload.total >= 1);
    assert.equal(payload.data[0].status, "new");
  });

  it("enforces member visibility and assignment permissions", async () => {
    const admin = await login("admin@example.com", "admin123");
    const member = await login("member@example.com", "member123");

    const adminLeads = await request("/api/leads", { headers: { cookie: admin.cookie } });
    const unassigned = adminLeads.payload.data.find((lead) => lead.assignedTo === null);
    assert.ok(unassigned);

    const memberRead = await request(`/api/leads/${unassigned.id}`, { headers: { cookie: member.cookie } });
    assert.equal(memberRead.response.status, 403);

    const memberAssign = await request(`/api/leads/lead_001`, {
      method: "PATCH",
      headers: { cookie: member.cookie },
      body: JSON.stringify({ assignedTo: "usr_member" })
    });
    assert.equal(memberAssign.response.status, 403);

    const memberStatus = await request(`/api/leads/lead_001`, {
      method: "PATCH",
      headers: { cookie: member.cookie },
      body: JSON.stringify({ status: "proposal" })
    });
    assert.equal(memberStatus.response.status, 200);
    assert.equal(memberStatus.payload.data.status, "proposal");
  });

  it("adds notes and activity entries", async () => {
    const { cookie } = await login("member@example.com", "member123");
    const note = await request("/api/leads/lead_001/notes", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ body: "Followed up with pricing questions." })
    });
    assert.equal(note.response.status, 201);

    const lead = await request("/api/leads/lead_001", { headers: { cookie } });
    assert.equal(lead.payload.data.notes[0].body, "Followed up with pricing questions.");
    assert.equal(lead.payload.data.activity[0].type, "note_added");
  });
});
