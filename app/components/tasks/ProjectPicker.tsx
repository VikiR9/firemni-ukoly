"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BoardSnapshot } from "@/lib/task-board";
import type { Task } from "@/lib/tasks";
import { getAllUsers } from "@/lib/auth";
import Modal from "./Modal";
import ProjectOrderDialog from "./ProjectOrderDialog";
import s from "./Workspace.module.css";
import styles from "./Projects.module.css";
export default function ProjectPicker({
  board,
  username,
  tasks,
  disabled,
  onSelect,
  onSaved,
}: {
  board: BoardSnapshot;
  username: string;
  tasks: Task[];
  disabled: boolean;
  onSelect: (id: string) => void;
  onSaved: (b: BoardSnapshot) => void;
}) {
  const [mode, setMode] = useState<
      "create_project" | "rename_project" | "delete_project" | "add_task" | null
    >(null),
    [title, setTitle] = useState(""),
    [color, setColor] = useState("#177d6b"),
    [members, setMembers] = useState<string[]>([]),
    [taskId, setTaskId] = useState(""),
    [revision, setRevision] = useState(board.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = board.projects?.find((p) => p.id === board.project_id);
  const editingSettings =
    mode === "create_project" || mode === "rename_project";
  const ownerUsername =
    mode === "create_project" ? username : current?.owner_username;
  const ownerName = getAllUsers().find(
    (u) => u.username === ownerUsername,
  )?.displayName;
  const [ordering, setOrdering] = useState(false);
  const projectRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = projectRow.current;
    const selected = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !selected) return;
    const bounds = row.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    if (card.left < bounds.left) row.scrollLeft -= bounds.left - card.left + 2;
    else if (card.right > bounds.right)
      row.scrollLeft += card.right - bounds.right + 2;
  }, [board.project_id]);
  const available = tasks.filter(
    (t) => !t.archived_at && !board.placements.some((p) => p.task_id === t.id),
  );
  function open(m: typeof mode) {
    setMode(m);
    setTitle(m === "rename_project" ? current?.title || "" : "");
    setColor(m === "rename_project" ? current?.color || "#177d6b" : "#177d6b");
    setMembers(m === "rename_project" ? current?.member_usernames || [] : []);
    setTaskId("");
    setRevision(board.revision);
    setError("");
  }
  return (
    <>
      <div className={styles.projectBar}>
        <div
          ref={projectRow}
          className={styles.projects}
          role="group"
          aria-label="Projekty"
        >
          <button
            type="button"
            className={styles.projectCard}
            aria-pressed={!board.project_id}
            disabled={disabled || busy}
            onClick={() => onSelect("")}
          >
            <span className={styles.projectMark} aria-hidden="true">
              ▦
            </span>
            <span>Všechny úkoly</span>
          </button>
          {board.projects?.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.projectCard}
              style={
                { "--project-color": p.color || "#177d6b" } as CSSProperties
              }
              aria-pressed={board.project_id === p.id}
              disabled={disabled || busy}
              title={p.title}
              onClick={() => onSelect(p.id)}
            >
              <span className={styles.projectMark} aria-hidden="true">
                ▱
              </span>
              <span className={styles.projectName}>
                <strong>{p.title}</strong>
                {!!p.member_usernames?.length && (
                  <small>Sdílený · {p.member_usernames.length + 1} lidí</small>
                )}
                {p.owner_username !== username && (
                  <small className={styles.projectOwner}>
                    {getAllUsers().find((u) => u.username === p.owner_username)
                      ?.displayName || p.owner_username}
                  </small>
                )}
              </span>
            </button>
          ))}
          <button
            className={s.secondary}
            disabled={disabled || busy}
            onClick={() => open("create_project")}
          >
            + Nový projekt
          </button>
          {current && (
            <>
              {(board.can_manage_project ??
                current.owner_username === username) && (
                <button
                  className={s.secondary}
                  disabled={disabled || busy}
                  onClick={() => open("rename_project")}
                >
                  Upravit projekt
                </button>
              )}
              {board.can_delete_project && (
                <button
                  className={s.danger}
                  disabled={disabled || busy}
                  onClick={() => open("delete_project")}
                >
                  Smazat projekt
                </button>
              )}
              {board.can_edit_columns && (
                <button
                  className={s.secondary}
                  disabled={disabled || busy}
                  onClick={() => open("add_task")}
                >
                  Přidat existující úkol
                </button>
              )}
            </>
          )}
        </div>
        {(board.projects?.length ?? 0) > 1 && (
          <button
            className={styles.orderToggle}
            disabled={disabled || busy}
            onClick={() => setOrdering(true)}
            aria-label="Uspořádat projekty"
            title="Uspořádat projekty"
          >
            <span aria-hidden>⇄</span>
            <small>Pořadí</small>
          </button>
        )}
      </div>
      {ordering && (
        <ProjectOrderDialog
          board={board}
          onClose={() => setOrdering(false)}
          onSaved={onSaved}
        />
      )}
      {mode && (
        <Modal
          title={
            mode === "create_project"
              ? "Nový projekt"
              : mode === "add_task"
                ? "Přidat úkol do projektu"
                : mode === "delete_project"
                  ? "Smazat projekt"
                  : "Upravit projekt"
          }
          busy={busy}
          onClose={() => setMode(null)}
        >
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/task-board", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: mode,
                    project_id: board.project_id,
                    title,
                    color,
                    ...(editingSettings ? { member_usernames: members } : {}),
                    task_id: taskId,
                    column_id: board.columns[0]?.id,
                    revision,
                  }),
                });
                const result = await r.json();
                if (!r.ok) throw Error(result.error);
                if (mode === "create_project") onSelect(result.project_id);
                else if (mode === "delete_project") onSelect("");
                else onSaved(result);
                setMode(null);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Změnu nelze uložit.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "delete_project" ? (
              <p>
                Opravdu smazat projekt <strong>{current?.title}</strong>?
                Projekt, jeho sloupce a zařazení úkolů budou trvale odstraněny
                pro všechny členy. Samotné úkoly, jejich komentáře a zařazení do
                ostatních projektů zůstanou zachované.
              </p>
            ) : mode === "add_task" ? (
              <label className={s.field}>
                Úkol
                <select
                  className={s.select}
                  required
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  <option value="">Vyberte úkol…</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                {!available.length && (
                  <small>Všechny dostupné úkoly už jsou v projektu.</small>
                )}
              </label>
            ) : (
              <label className={s.field}>
                Název projektu
                <input
                  className={s.input}
                  required
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </label>
            )}
            {editingSettings && (
              <label className={s.field}>
                Barva projektu
                <input
                  type="color"
                  aria-label="Barva projektu"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{
                    width: 72,
                    height: 40,
                    border: 0,
                    background: "none",
                  }}
                />
              </label>
            )}
            {editingSettings && (
              <fieldset className={styles.members} disabled={busy}>
                <legend>Členové projektu</legend>
                <p>
                  {ownerUsername === username
                    ? "Vy jste správce."
                    : `Správce projektu: ${ownerName || ownerUsername}.`}{" "}
                  Vybraní kolegové získají společnou nástěnku a mohou upravovat
                  sloupce.
                </p>
                {getAllUsers()
                  .filter((u) => u.username !== ownerUsername)
                  .map((u) => (
                    <label key={u.username}>
                      <input
                        type="checkbox"
                        checked={members.includes(u.username)}
                        onChange={(e) =>
                          setMembers(
                            e.target.checked
                              ? [...members, u.username]
                              : members.filter((name) => name !== u.username),
                          )
                        }
                      />
                      {u.displayName}
                    </label>
                  ))}
              </fieldset>
            )}
            {error && (
              <p role="alert" className={s.formError}>
                {error}
              </p>
            )}
            <div className={s.formFooter}>
              {mode === "delete_project" && (
                <button
                  type="button"
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => setMode(null)}
                  autoFocus
                >
                  Zrušit
                </button>
              )}
              <button
                className={mode === "delete_project" ? s.danger : s.primary}
                disabled={busy}
              >
                {busy
                  ? mode === "delete_project"
                    ? "Mažu…"
                    : "Ukládám…"
                  : mode === "create_project"
                    ? "Vytvořit projekt"
                    : mode === "delete_project"
                      ? "Smazat projekt"
                      : "Uložit"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
