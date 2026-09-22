"use client";
import { useState } from "react";
import type { Task } from "@/lib/tasks";
import { todayISO } from "@/lib/tasks";
import s from "./Projects.module.css";
import ProjectLabels from "./ProjectLabels";
import type { BoardSnapshot } from "@/lib/task-board";
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function TaskCalendar({
  tasks,
  taskProjects,
  onOpen,
  onNew,
}: {
  tasks: Task[];
  taskProjects: (id: string) => NonNullable<BoardSnapshot["projects"]>;
  onOpen: (id: string) => void;
  onNew: (date: string) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const today = todayISO();
  return (
    <section className={s.calendar} aria-label="Kalendář úkolů">
      <div className={s.calendarHeader}>
        <h2 aria-live="polite">
          {month.toLocaleDateString("cs-CZ", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div>
          <button
            aria-label="Předchozí měsíc"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <button
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Dnes
          </button>
          <button
            aria-label="Příští měsíc"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
      </div>
      <div className={s.calendarGrid}>
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
          <div className={s.weekday} key={d}>
            {d}
          </div>
        ))}
        {days.map((d) => {
          const date = iso(d);
          const entries = tasks.filter((t) => t.due?.slice(0, 10) === date);
          return (
            <div
              key={date}
              className={s.day}
              data-outside={d.getMonth() !== month.getMonth()}
              data-today={date === today}
              aria-label={d.toLocaleDateString("cs-CZ")}
            >
              <div className={s.dayHeading}>
                <span>{d.getDate()}</span>
                <button
                  aria-label={`Přidat úkol na ${date}`}
                  onClick={() => onNew(date)}
                >
                  +
                </button>
              </div>
              {entries.map((t) => (
                <button
                  key={t.id}
                  className={s.calendarTask}
                  style={{
                    borderLeft:
                      "4px solid " +
                      (taskProjects(t.id)[0]?.color || "#b6c9bd"),
                  }}
                  title={t.title}
                  onClick={() => onOpen(t.id)}
                >
                  {t.title}
                  <ProjectLabels projects={taskProjects(t.id)} />
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className={s.undated}>
        <h3>
          Bez termínu <small>({tasks.filter((t) => !t.due).length})</small>
        </h3>
        {tasks
          .filter((t) => !t.due)
          .map((t) => (
            <button
              key={t.id}
              className={s.calendarTask}
              style={{
                borderLeft:
                  "4px solid " + (taskProjects(t.id)[0]?.color || "#b6c9bd"),
              }}
              onClick={() => onOpen(t.id)}
            >
              {t.title}
              <ProjectLabels projects={taskProjects(t.id)} />
            </button>
          ))}
      </div>
    </section>
  );
}
