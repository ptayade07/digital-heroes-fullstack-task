import { LEAD_STATUSES } from "./config.js";

export function requireFields(input, fields) {
  const missing = fields.filter((field) => !String(input[field] || "").trim());
  if (missing.length) {
    return { ok: false, details: missing.map((field) => `${field} is required`) };
  }
  return { ok: true };
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function validatePublicLead(input) {
  const required = requireFields(input, ["name", "email", "company", "message"]);
  if (!required.ok) return required;
  if (!isEmail(input.email)) return { ok: false, details: ["email must be valid"] };
  if (String(input.message).length > 1200) return { ok: false, details: ["message must be 1200 characters or fewer"] };
  return { ok: true };
}

export function validateLeadPatch(input, users) {
  const patch = {};
  if (input.status !== undefined) {
    if (!LEAD_STATUSES.includes(input.status)) {
      return { ok: false, details: [`status must be one of: ${LEAD_STATUSES.join(", ")}`] };
    }
    patch.status = input.status;
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo !== null && !users.some((user) => user.id === input.assignedTo)) {
      return { ok: false, details: ["assignedTo must be an existing user id or null"] };
    }
    patch.assignedTo = input.assignedTo;
  }
  return { ok: true, patch };
}
