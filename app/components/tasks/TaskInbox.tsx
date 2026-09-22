"use client";
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/tasks";
import type { User } from "@/lib/auth";
import type { BoardSnapshot } from "@/lib/task-board";
import Modal from "./Modal";
import s from "./Workspace.module.css";
import css from "./TaskInbox.module.css";
export const inInbox = (task: Task, user: User) =>
  !task.archived_at &&
  task.task_assignments.some(
    (a) =>
      a.assignee === user.displayName &&
      a.status === "PENDING_ACCEPT" &&
      (a.assigned_by ?? task.created_by) !== user.displayName,
  );
export default function TaskInbox({
  tasks,
  user,
  board,
  open,
  onOpen,
  onClose,
  onRefresh,
}: {
  tasks: Task[];
  user: User;
  board: BoardSnapshot | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const pending = tasks.filter((t) => inInbox(t, user));
  const [selected, setSelected] = useState(""),
    [project, setProject] = useState(""),
    [destination, setDestination] = useState<BoardSnapshot | null>(null),
    [column, setColumn] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [newTitle, setNewTitle] = useState(""),
    [creating, setCreating] = useState(false);
  const task = pending.find((t) => t.id === selected) || pending[0];
  const seq = useRef(0);
  useEffect(() => {
    if (!open || !project) return;
    const version = ++seq.current;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setDestination(null);
      try {
        const r = await fetch(
          "/api/task-board?project_id=" + encodeURIComponent(project),
          { cache: "no-store" },
        );
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (!cancelled && version === seq.current) {
          setDestination(b);
          setColumn(b.columns[0]?.id || "");
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Projekt nelze načíst.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, project]);
  const projects = (board?.projects || []).filter(
    (p) => p.owner_username === user.username || p.member_usernames?.includes(user.username),
  );
  async function createProject() {
    if (busy || !newTitle.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/task-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_project", title: newTitle }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await onRefresh();
      setProject(b.project_id);
      setCreating(false);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Projekt nelze vytvořit.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={css.banner}
        data-pending={pending.length > 0}
        onClick={onOpen}
      >
        <span className={css.icon}>✉</span>
        <span>
          <strong>Schránka úkolů</strong>
          <small>
            {pending.length
              ? "Nové úkoly od kolegů čekají na přijetí a zařazení."
              : "Všechny doručené úkoly jsou zpracované."}
          </small>
        </span>
        <b aria-label={`${pending.length} úkolů ke zpracování`}>
          {pending.length}
        </b>
        <span>Otevřít →</span>
      </button>
      {open && (
        <Modal
          title={`Schránka úkolů · ${pending.length} ke zpracování`}
          wide
          busy={busy}
          onClose={onClose}
        >
          <div className={css.content}>
            {!task ? (
              <p>Ve schránce nemáte žádné nové úkoly.</p>
            ) : (
              <>
                <div className={css.list}>
                  {pending.map((t) => (
                    <button
                      key={t.id}
                      aria-pressed={task.id === t.id}
                      onClick={() => {
                        setSelected(t.id);
                        setError("");
                      }}
                      disabled={busy}
                    >
                      <strong>{t.title}</strong>
                      <small>
                        Od:{" "}
                        {t.task_assignments.find(
                          (a) => a.assignee === user.displayName,
                        )?.assigned_by ||
                          t.created_by ||
                          "kolegy"}
                      </small>
                    </button>
                  ))}
                </div>
                <form
                  className={css.detail}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy || loading || !destination || !column) return;
                    setBusy(true);
                    setError("");
                    try {
                      const r = await fetch("/api/task-board", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "accept_task",
                          project_id: project,
                          column_id: column,
                          task_id: task.id,
                          revision: destination.revision,
                        }),
                      });
                      const b = await r.json();
                      if (!r.ok) throw Error(b.error);
                      setDestination(b);
                      await onRefresh();
                      setSelected("");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Úkol nelze přijmout.",
                      );
                      setProject("");
                      setDestination(null);
                      await onRefresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h3>{task.title}</h3>
                  <p>{task.description || "Bez dalšího zadání."}</p>
                  <small>Termín: {task.due || "bez termínu"}</small>
                  <label className={s.field}>
                    Můj projekt
                    <select
                      className={s.select}
                      required
                      disabled={busy || loading}
                      value={project}
                      onChange={(e) => {
                        setProject(e.target.value);
                        setDestination(null);
                        setColumn("");
                      }}
                    >
                      <option value="">Vyberte projekt…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => setCreating(!creating)}
                  >
                    + Nový projekt
                  </button>
                  {creating && (
                    <div className={css.newProject}>
                      <label className={s.field}>
                        Název nového projektu
                        <input
                          className={s.input}
                          maxLength={80}
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy || !newTitle.trim()}
                        onClick={() => void createProject()}
                      >
                        Vytvořit projekt
                      </button>
                    </div>
                  )}
                  <label className={s.field}>
                    Sloupec
                    <select
                      className={s.select}
                      required
                      disabled={busy || loading || !destination}
                      value={column}
                      onChange={(e) => setColumn(e.target.value)}
                    >
                      <option value="">
                        {loading ? "Načítám sloupce…" : "Vyberte sloupec…"}
                      </option>
                      {destination?.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {error && (
                    <p className={s.formError} role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className={s.primary}
                    disabled={busy || loading || !column || !destination}
                  >
                    {busy ? "Ukládám…" : "Přijmout a zařadit"}
                  </button>
                </form>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
