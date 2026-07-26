export const PORT = Number(process.env.PORT || 3000);
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
export const COOKIE_NAME = "dh_session";

export const DEFAULT_USERS = [
  {
    id: "usr_admin",
    name: "Aarav Admin",
    email: "admin@example.com",
    password: "admin123",
    role: "admin"
  },
  {
    id: "usr_member",
    name: "Maya Member",
    email: "member@example.com",
    password: "member123",
    role: "member"
  }
];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
