// Simple auth logic with hardcoded users
export type UserRole = "OWNER" | "EMPLOYEE";

export interface User {
  username: string;
  displayName: string;
  role: UserRole;
}

// Hardcoded users (password is same for all: Kotrmelec99)
const USERS: Record<string, User> = {
  MILAN: { username: "MILAN", displayName: "Milan", role: "OWNER" },
  MILOS: { username: "MILOS", displayName: "Miloš", role: "EMPLOYEE" },
  KARINA: { username: "KARINA", displayName: "Karina", role: "EMPLOYEE" },
  KATERINA: { username: "KATERINA", displayName: "Kateřina", role: "EMPLOYEE" },
  VENDULA: { username: "VENDULA", displayName: "Vendula", role: "EMPLOYEE" },
  VIKTOR: { username: "VIKTOR", displayName: "Viktor", role: "EMPLOYEE" },
  NIKOLA: { username: "NIKOLA", displayName: "Nikola", role: "EMPLOYEE" },
};

const PASSWORD = "Kotrmelec99";
const SESSION_KEY = "firemni-ukoly:session";

export function validateCredentials(username: string, password: string): User | null {
  const normalizedUsername = username.toUpperCase();
  if (password !== PASSWORD) return null;
  return USERS[normalizedUsername] || null;
}

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
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getAllUsers(): User[] {
  return Object.values(USERS);
}
