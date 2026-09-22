"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import type { BoardSnapshot } from "@/lib/task-board";
import { describeError, type TaskPlacementChange } from "@/lib/tasks";
import s from "./Workspace.module.css";

export default function TaskPlacementFields({
  taskId,
  isNew,
  initialProjectId,
  initialColumnId,
  projects,
  user,
  busy,
  onChange,
  onDraftChange,
}: {
  taskId: string;
  isNew: boolean;
  initialProjectId?: string | null;
  initialColumnId?: string;
  projects: NonNullable<BoardSnapshot["projects"]>;
  user: User;
  busy: boolean;
  onChange: (placement: TaskPlacementChange | null) => void;
  onDraftChange: (projectId: string | null, columnId: string) => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const [destination, setDestination] = useState<BoardSnapshot | null>(null);
  const [columnId, setColumnId] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const source = useRef<{
    project_id: string | null;
    column_id: string | null;
    revision: number;
  } | null>(null);
  const available = projects.filter(
    (p) =>
      p.owner_username === user.username ||
      p.member_usernames?.includes(user.username),
  );
  useEffect(() => {
    const controller = new AbortController();
    setDestination(null);
    setError("");
    onChange(null);
    void (async () => {
      try {
        const response = await fetch(
          "/api/task-board?project_id=" + encodeURIComponent(projectId),
          { cache: "no-store", signal: controller.signal },
        );
        const board: BoardSnapshot & { error?: string } = await response.json();
        if (!response.ok) throw Error(board.error || "Projekt nelze načíst.");
        if (projectId && !board.can_edit_columns)
          throw Error("Do tohoto projektu nemůžete úkol zařadit.");
        if (controller.signal.aborted) return;
        const existing = board.placements.find((p) => p.task_id === taskId);
        if (!source.current) {
          if (!isNew && projectId && !existing)
            throw Error(
              "Zařazení úkolu se změnilo. Zavřete formulář a otevřete jej znovu.",
            );
          source.current = {
            project_id: projectId || null,
            column_id: existing?.column_id || null,
            revision: board.revision,
          };
        }
        const preferred =
          isNew && projectId === (initialProjectId || "")
            ? initialColumnId
            : undefined;
        const column =
          (preferred && board.columns.some((c) => c.id === preferred)
            ? preferred
            : existing?.column_id) ||
          board.columns[0]?.id ||
          "";
        if (!column) throw Error("Projekt nemá dostupný sloupec.");
        setDestination(board);
        setColumnId(column);
        onChange({
          project_id: projectId || null,
          column_id: column,
          revision: board.revision,
          source_project_id: source.current.project_id,
          source_column_id: source.current.column_id,
          source_revision: source.current.revision,
        });
        onDraftChange(projectId || null, column);
      } catch (e) {
        if (!controller.signal.aborted) setError(describeError(e));
      }
    })();
    return () => controller.abort();
  }, [
    projectId,
    retry,
    taskId,
    isNew,
    initialProjectId,
    initialColumnId,
    onChange,
    onDraftChange,
  ]);
  return (
    <fieldset disabled={busy}>
      <div className={s.formRow}>
        <label
          className={s.field}
          style={!projectId ? { gridColumn: "1 / -1" } : undefined}
        >
          Můj projekt
          <select
            className={s.select}
            value={projectId}
            disabled={!source.current && !destination && !error}
            onChange={(e) => {
              setProjectId(e.target.value);
              setDestination(null);
              setColumnId("");
              onChange(null);
            }}
          >
            <option value="">Bez projektu</option>
            {projectId && !available.some((p) => p.id === projectId) && (
              <option value={projectId} disabled>
                Nedostupný projekt
              </option>
            )}
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        {projectId && (
          <label className={s.field}>
            Sloupec
            <select
              className={s.select}
              required
              disabled={!destination}
              value={columnId}
              onChange={(e) => {
                setColumnId(e.target.value);
                if (destination && source.current) {
                  onChange({
                    project_id: projectId || null,
                    column_id: e.target.value,
                    revision: destination.revision,
                    source_project_id: source.current.project_id,
                    source_column_id: source.current.column_id,
                    source_revision: source.current.revision,
                  });
                  onDraftChange(projectId || null, e.target.value);
                }
              }}
            >
              {!destination && (
                <option value="">
                  {error ? "Sloupce nejsou dostupné" : "Načítám sloupce…"}
                </option>
              )}
              {destination?.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className={s.savedDraft}>
        Příjemce si projekt a sloupec zvolí sám při přijetí. Ve sdíleném
        projektu je sloupec společný pro jeho členy. Ostatní zařazení úkolu se
        nemění.
      </p>
      {error && (
        <div role="alert" className={s.formError}>
          {error}{" "}
          <button
            type="button"
            className={s.quiet}
            onClick={() => setRetry((n) => n + 1)}
          >
            Zkusit znovu
          </button>
        </div>
      )}
    </fieldset>
  );
}
