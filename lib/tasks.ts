import type { User } from "./auth";

export type TaskStatus =
  | "PENDING_ACCEPT"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "SUBMITTED_DONE"
  | "DONE"
  | "DECLINED"
  | "RETURNED";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type Assignment = {
  assigned_by?: string | null;
  task_id: string;
  assignee: string;
  status: TaskStatus;
  updated_at: string;
  completed_at: string | null;
  reminder_on: string | null;
};
export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  due: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  requires_approval: boolean;
  task_assignments: Assignment[];
};
export type TaskUpdate = {
  id: string;
  task_id: string;
  author: string;
  body: string;
  kind: "comment" | "event";
  created_at: string;
};
export type TaskDraft = {
  project_id?: string | null;
  column_id?: string;
  id: string;
  title: string;
  description: string;
  priority: Priority;
  due: string;
  assignees: string[];
  requires_approval: boolean;
};
export type TaskPlacementChange = {
  project_id: string | null;
  column_id: string;
  revision: number;
  source_project_id: string | null;
  source_column_id: string | null;
  source_revision: number;
};
export const canOrganize = (task: Task, user: User) =>
  !task.archived_at &&
  (task.created_by === user.displayName ||
    (!task.task_assignments.some(
      (a) => a.assignee === user.displayName && a.status === "PENDING_ACCEPT",
    ) &&
      (user.role === "OWNER" ||
        task.task_assignments.some(
          (a) =>
            a.assignee === user.displayName &&
            !["PENDING_ACCEPT", "DECLINED"].includes(a.status),
        ))));
export const STATUS: Record<TaskStatus, string> = {
  PENDING_ACCEPT: "K přijetí",
  ACCEPTED: "Připraveno",
  IN_PROGRESS: "Rozpracováno",
  BLOCKED: "Čeká na…",
  SUBMITTED_DONE: "Ke schválení",
  DONE: "Hotovo",
  DECLINED: "Odmítnuto",
  RETURNED: "K dopracování",
};
export const PRIORITY: Record<Priority, string> = {
  Low: "Nízká",
  Medium: "Běžná",
  High: "Vysoká",
  Urgent: "Urgentní",
};
export const PRIORITY_RANK: Record<Priority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};
export const TASK_SORT_LABELS = {
  manual: "Ruční pořadí",
  due: "Termín: od nejbližšího",
  due_desc: "Termín: od nejvzdálenějšího",
  newest: "Vytvoření: od nejnovějšího",
  oldest: "Vytvoření: od nejstaršího",
  priority: "Podle priority",
} as const;
export type TaskSort = keyof typeof TASK_SORT_LABELS;
export type TaskView = "board" | "list" | "calendar";
export function parseTaskSorts(raw: string | null): Record<string, TaskSort> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, TaskSort] =>
          typeof entry[1] === "string" &&
          Object.hasOwn(TASK_SORT_LABELS, entry[1]),
      ),
    );
  } catch {
    return {};
  }
}
export function taskSortContext(
  projectId: string,
  scope: string,
  filter: string,
  view: TaskView,
) {
  return JSON.stringify([projectId, projectId ? "" : scope, filter, view]);
}
export function sortTasks(tasks: readonly Task[], sort: TaskSort): Task[] {
  if (sort === "manual") return [...tasks];
  const dueOrder = (a: Task, b: Task, descending = false) => {
    // Undated tasks remain last in both directions.
    if (!a.due) return b.due ? 1 : 0;
    if (!b.due) return -1;
    return descending ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due);
  };
  const createdOrder = (a: Task, b: Task) =>
    Date.parse(a.created_at) - Date.parse(b.created_at);
  return [...tasks].sort((a, b) => {
    const order =
      sort === "newest"
        ? createdOrder(b, a)
        : sort === "oldest"
          ? createdOrder(a, b)
          : sort === "priority"
            ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
              dueOrder(a, b)
            : dueOrder(a, b, sort === "due_desc") ||
              PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return order || createdOrder(a, b) || a.id.localeCompare(b.id);
  });
}
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dateLabel = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "short",
      })
    : "Bez termínu";
export const timestampLabel = (value: string) =>
  new Date(value).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const complete = (task: Task) =>
  task.task_assignments.length > 0 &&
  task.task_assignments.every((a) => a.status === "DONE");
export const overdue = (task: Task, today = todayISO()) =>
  !task.archived_at && !complete(task) && !!task.due && task.due < today;
export const canManage = (task: Task, user: User) =>
  user.role === "OWNER" || task.created_by === user.displayName;
export function statusFor(task: Task, person?: string): TaskStatus {
  const assignments = person
    ? task.task_assignments.filter((a) => a.assignee === person)
    : task.task_assignments;
  if (!assignments.length) return "PENDING_ACCEPT";
  if (assignments.every((a) => a.status === "DONE")) return "DONE";
  return (
    (
      [
        "RETURNED",
        "SUBMITTED_DONE",
        "BLOCKED",
        "DECLINED",
        "IN_PROGRESS",
        "PENDING_ACCEPT",
        "ACCEPTED",
      ] as TaskStatus[]
    ).find((status) => assignments.some((a) => a.status === status)) ??
    "ACCEPTED"
  );
}
export function availableActions(
  task: Task,
  assignment: Assignment,
  user: User,
): TaskStatus[] {
  if (task.archived_at) return [];
  const s = assignment.status;
  if (s === "SUBMITTED_DONE")
    return user.role === "OWNER" ? ["DONE", "RETURNED"] : [];
  if (s === "DECLINED" || s === "DONE")
    return canManage(task, user) ? ["PENDING_ACCEPT"] : [];
  if (assignment.assignee !== user.displayName) return [];
  if (s === "PENDING_ACCEPT") return ["ACCEPTED", "DECLINED"];
  return [
    ...(s !== "IN_PROGRESS" ? ["IN_PROGRESS" as TaskStatus] : []),
    ...(s !== "BLOCKED" ? ["BLOCKED" as TaskStatus] : []),
    task.requires_approval ? "SUBMITTED_DONE" : "DONE",
  ];
}
export const actionLabel = (status: TaskStatus, previous: TaskStatus) =>
  status === "DONE"
    ? previous === "SUBMITTED_DONE"
      ? "Schválit"
      : "Dokončit"
    : {
        ACCEPTED: "Přijmout",
        IN_PROGRESS: "Začít pracovat",
        BLOCKED: "Čekám na…",
        SUBMITTED_DONE: "Odevzdat ke kontrole",
        RETURNED: "Vrátit",
        DECLINED: "Odmítnout",
        PENDING_ACCEPT: "Znovu otevřít",
      }[status];
export function describeError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Operace se nezdařila.";
  return /fetch|network/i.test(message)
    ? "Databáze není dostupná. Zkontrolujte připojení a zkuste to znovu. Rozepsané údaje zůstávají zachované."
    : message;
}
