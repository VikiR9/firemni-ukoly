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
