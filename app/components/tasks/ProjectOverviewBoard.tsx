"use client";
import { useMemo, type ReactNode } from "react";
import { projectTaskGroups, type BoardSnapshot } from "@/lib/task-board";
import type { Task } from "@/lib/tasks";
import s from "./Board.module.css";

export default function ProjectOverviewBoard({
  board,
  tasks,
  renderCard,
  onProject,
}: {
  board: BoardSnapshot;
  tasks: Task[];
  renderCard: (task: Task) => ReactNode;
  onProject: (id: string) => void;
}) {
  const groups = useMemo(() => projectTaskGroups(board, tasks), [board, tasks]);
  return (
    <>
      <p className={s.saving} data-hint="true">
        Každý sloupec představuje projekt. Tento přehled se tvoří automaticky;
        zařazení úkolů upravíte v projektu nebo v detailu úkolu.
      </p>
      <div className={s.board} aria-label="Přehled úkolů podle projektů">
        {groups.map((group) => (
          <section
            key={group.id}
            className={s.column}
            aria-label={group.title}
            style={{ borderTop: `3px solid ${group.color}` }}
          >
            <div className={s.columnHeader}>
              <h2 className={s.columnTitle}>
                {group.id ? (
                  <button
                    type="button"
                    className={s.projectLink}
                    onClick={() => onProject(group.id)}
                    aria-label={`Otevřít projekt: ${group.title}`}
                  >
                    {group.title} <span aria-hidden>↗</span>
                  </button>
                ) : (
                  group.title
                )}
              </h2>
              <span className={s.count}>{group.tasks.length}</span>
            </div>
            <div className={s.overviewCards}>
              {group.tasks.map((task) => (
                <div key={task.id}>{renderCard(task)}</div>
              ))}
            </div>
            {!group.tasks.length && (
              <p className={s.empty}>Žádné úkoly v tomto pohledu</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
