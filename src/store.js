import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_USERS } from "./config.js";

const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "db.json");

function now() {
  return new Date().toISOString();
}

function seedData() {
  return {
    users: DEFAULT_USERS,
    sessions: [],
    leads: [
      {
        id: "lead_001",
        name: "Nina Patel",
        email: "nina@northstar-retail.test",
        company: "Northstar Retail",
        source: "Website",
        message: "We need help consolidating two Shopify stores before Q4.",
        status: "qualified",
        assignedTo: "usr_member",
        notes: [
          {
            id: "note_001",
            authorId: "usr_admin",
            body: "Good fit. Existing Shopify footprint and urgent timeline.",
            createdAt: now()
          }
        ],
        activity: [
          {
            id: "act_001",
            actorId: "system",
            type: "created",
            detail: "Seed lead created",
            createdAt: now()
          }
        ],
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: "lead_002",
        name: "Marcus Reed",
        email: "marcus@atlas-ops.test",
        company: "Atlas Ops",
        source: "Referral",
        message: "Looking for a web rebuild and paid acquisition support.",
        status: "new",
        assignedTo: null,
        notes: [],
        activity: [
          {
            id: "act_002",
            actorId: "system",
            type: "created",
            detail: "Seed lead created",
            createdAt: now()
          }
        ],
        createdAt: now(),
        updatedAt: now()
      }
    ]
  };
}

export class JsonStore {
  constructor(filePath = DEFAULT_DB_PATH) {
    this.filePath = filePath;
    this.data = seedData();
    this.load();
  }

  load() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      this.persist();
      return;
    }
    this.data = JSON.parse(readFileSync(this.filePath, "utf8"));
  }

  persist() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  listUsers() {
    return this.data.users.map(({ password, ...user }) => user);
  }

  findUserByEmail(email) {
    return this.data.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find((user) => user.id === id);
  }

  createSession(userId, expiresAt) {
    const session = {
      id: randomUUID(),
      userId,
      expiresAt,
      createdAt: now()
    };
    this.data.sessions.push(session);
    this.persist();
    return session;
  }

  deleteSession(sessionId) {
    this.data.sessions = this.data.sessions.filter((session) => session.id !== sessionId);
    this.persist();
  }

  findSession(sessionId) {
    return this.data.sessions.find((session) => session.id === sessionId);
  }

  listLeads({ user, status, assignedTo, search, page = 1, pageSize = 10 }) {
    let rows = [...this.data.leads];
    if (user.role === "member") {
      rows = rows.filter((lead) => lead.assignedTo === user.id);
    }
    if (status) rows = rows.filter((lead) => lead.status === status);
    if (assignedTo) rows = rows.filter((lead) => lead.assignedTo === assignedTo);
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter((lead) =>
        [lead.name, lead.email, lead.company, lead.message].some((value) =>
          String(value || "").toLowerCase().includes(term)
        )
      );
    }
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      data: rows.slice(start, start + pageSize)
    };
  }

  findLead(id) {
    return this.data.leads.find((lead) => lead.id === id);
  }

  createLead(input) {
    const timestamp = now();
    const lead = {
      id: `lead_${randomUUID()}`,
      name: input.name,
      email: input.email,
      company: input.company,
      source: input.source || "Website",
      message: input.message,
      status: "new",
      assignedTo: null,
      notes: [],
      activity: [
        {
          id: `act_${randomUUID()}`,
          actorId: "system",
          type: "created",
          detail: "Lead submitted from public capture form",
          createdAt: timestamp
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.data.leads.push(lead);
    this.persist();
    return lead;
  }

  updateLead(id, patch, actorId) {
    const lead = this.findLead(id);
    if (!lead) return null;
    const changes = [];
    for (const [key, value] of Object.entries(patch)) {
      if (lead[key] !== value) {
        changes.push(`${key}: ${lead[key] ?? "none"} -> ${value ?? "none"}`);
        lead[key] = value;
      }
    }
    if (changes.length) {
      lead.updatedAt = now();
      lead.activity.unshift({
        id: `act_${randomUUID()}`,
        actorId,
        type: "updated",
        detail: changes.join("; "),
        createdAt: lead.updatedAt
      });
      this.persist();
    }
    return lead;
  }

  addNote(leadId, authorId, body) {
    const lead = this.findLead(leadId);
    if (!lead) return null;
    const timestamp = now();
    const note = {
      id: `note_${randomUUID()}`,
      authorId,
      body,
      createdAt: timestamp
    };
    lead.notes.unshift(note);
    lead.activity.unshift({
      id: `act_${randomUUID()}`,
      actorId: authorId,
      type: "note_added",
      detail: body,
      createdAt: timestamp
    });
    lead.updatedAt = timestamp;
    this.persist();
    return note;
  }
}
