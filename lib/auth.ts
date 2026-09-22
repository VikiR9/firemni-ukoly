// Simple auth logic with hardcoded users
export type UserRole = "OWNER" | "EMPLOYEE";

export interface User {
  username: string;
  displayName: string;
  role: UserRole;
}

// Shared roster. Credentials and signed sessions are verified only on the server.
const USERS: Record<string, User> = {
  MILAN: { username: "MILAN", displayName: "Milan", role: "OWNER" },
  MILOS: { username: "MILOS", displayName: "Miloš", role: "EMPLOYEE" },
  KARINA: { username: "KARINA", displayName: "Karina", role: "EMPLOYEE" },
  KATERINA: { username: "KATERINA", displayName: "Kateřina", role: "EMPLOYEE" },
  VENDULA: { username: "VENDULA", displayName: "Vendula", role: "EMPLOYEE" },
  VIKTOR: { username: "VIKTOR", displayName: "Viktor", role: "OWNER" },
  NIKOLA: { username: "NIKOLA", displayName: "Nikola", role: "EMPLOYEE" },
  LUKAS: { username: "LUKAS", displayName: "Lukáš", role: "EMPLOYEE" },
};

const SESSION_KEY = "firemni-ukoly:session";

export function saveSession(user: User): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

export function loadSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as User;
    // Resolve current role from the roster, including existing Viktor sessions.
    return USERS[saved.username] ?? null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    void fetch("/api/session", { method: "DELETE", keepalive: true });
  }
}

export function getAllUsers(): User[] {
  return Object.values(USERS);
}
