import type { Task } from "./tasks";

export type BoardColumn = { id: string; title: string; position: number };
export type BoardPlacement = {
  task_id: string;
  column_id: string;
  position: number;
};
export type BoardSnapshot = {
  project_order_revision?: number;
  project_id?: string | null;
  can_edit_columns?: boolean;
  can_manage_project?: boolean;
  can_delete_project?: boolean;
  projects?: {
    id: string;
    title: string;
    owner_username: string;
    member_usernames?: string[];
    color?: string;
  }[];
  project_memberships?: { project_id: string; task_id: string }[];
  revision: number;
  columns: BoardColumn[];
  placements: BoardPlacement[];
};

export function projectTaskGroups(
  board: BoardSnapshot,
  tasks: readonly Task[],
) {
  const groups = (board.projects || []).map((project) => ({
    id: project.id,
    title: project.title,
    color: project.color || "#177d6b",
    tasks: [] as Task[],
  }));
  const byProject = new Map(groups.map((group) => [group.id, group]));
  const memberships = new Map<string, Set<string>>();
  for (const membership of board.project_memberships || []) {
    if (!byProject.has(membership.project_id)) continue;
    const ids = memberships.get(membership.task_id) || new Set<string>();
    ids.add(membership.project_id);
    memberships.set(membership.task_id, ids);
  }
  const unassigned = {
    id: "",
    title: "Bez projektu",
    color: "#8b9b91",
    tasks: [] as Task[],
  };
  for (const task of tasks) {
    const ids = memberships.get(task.id);
    if (!ids?.size) unassigned.tasks.push(task);
    else for (const id of ids) byProject.get(id)!.tasks.push(task);
  }
  return [...groups, unassigned];
}

export function parseProjectMineFilters(
  raw: string | null,
): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([id, enabled]) => id && enabled === true),
    );
  } catch {
    return {};
  }
}

export function isOverviewLayoutMutation(action: string, projectId: unknown) {
  return (
    !projectId &&
    [
      "create_column",
      "rename_column",
      "move_column",
      "delete_column",
      "move_task",
    ].includes(action)
  );
}
