"use client";
import { useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardSnapshot } from "@/lib/task-board";
import { getAllUsers } from "@/lib/auth";
import Modal from "./Modal";
import s from "./Projects.module.css";
import ui from "./Workspace.module.css";

type Project = NonNullable<BoardSnapshot["projects"]>[number];
const ownerName = (project: Project) =>
  getAllUsers().find((u) => u.username === project.owner_username)
    ?.displayName || project.owner_username;

export default function ProjectOrderDialog({
  board,
  onClose,
  onSaved,
}: {
  board: BoardSnapshot;
  onClose: () => void;
  onSaved: (snapshot: BoardSnapshot) => void;
}) {
  // Keep the opening revision: an automatic refresh must not silently overwrite another device's order.
  const initial = useRef(board);
  const [projects, setProjects] = useState(board.projects || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const changed = projects.some(
    (p, i) => p.id !== initial.current.projects?.[i]?.id,
  );
  function move(from: number, to: number) {
    if (busy || from === to || from < 0 || to < 0 || to >= projects.length)
      return;
    setProjects(arrayMove(projects, from, to));
    setNotice(
      `${projects[from].title} · ${ownerName(projects[from])}: pozice ${to + 1} z ${projects.length}.`,
    );
    setError("");
  }
  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/task-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder_projects",
          project_id: initial.current.project_id,
          project_order_revision: initial.current.project_order_revision ?? 0,
          project_ids: projects.map((p) => p.id),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Pořadí se nepodařilo uložit.");
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pořadí se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Pořadí projektů"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className={ui.secondary} disabled={busy} onClick={onClose}>
            Zrušit
          </button>
          <button
            className={ui.primary}
            disabled={busy || !changed}
            onClick={() => void save()}
          >
            {busy ? "Ukládání…" : "Uložit pořadí"}
          </button>
        </>
      }
    >
      <div className={ui.form}>
        <p className={s.orderHint}>
          Přetáhněte projekt za úchyt nebo použijte šipky. Pořadí platí jen pro
          váš přehled a uloží se i pro ostatní zařízení.
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Přesouváte projekt ${projects.find(p => p.id === active.id)?.title || ""}.`,
              onDragOver: ({ over }) => over ? `Cílová pozice ${projects.findIndex(p => p.id === over.id) + 1} z ${projects.length}.` : undefined,
              onDragEnd: ({ over }) => over ? `Projekt je na pozici ${projects.findIndex(p => p.id === over.id) + 1}. Pořadí potvrďte tlačítkem Uložit pořadí.` : "Přesun zrušen.",
              onDragCancel: () => "Přesun zrušen.",
            },
            screenReaderInstructions: {
              draggable:
                "Mezerníkem uchopte projekt, šipkami nahoru a dolů změňte pozici. Mezerníkem potvrďte, Escape zruší přesun.",
            },
          }}
          onDragEnd={({ active, over }) => {
            if (over)
              move(
                projects.findIndex((p) => p.id === active.id),
                projects.findIndex((p) => p.id === over.id),
              );
          }}
        >
          <SortableContext
            items={projects.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className={s.orderList} aria-label="Pořadí projektů">
              {projects.map((project, index) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  index={index}
                  total={projects.length}
                  busy={busy}
                  onMove={(to) => move(index, to)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className={s.orderNotice} role="status">
          {notice}
        </p>
        {error && (
          <p className={ui.formError} role="alert">
            {error} Vaše rozpracované pořadí zůstalo zachované.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ProjectRow({
  project,
  index,
  total,
  busy,
  onMove,
}: {
  project: Project;
  index: number;
  total: number;
  busy: boolean;
  onMove: (to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: busy });
  const name = `${project.title} · ${ownerName(project)}`;
  return (
    <li
      ref={setNodeRef}
      className={s.orderRow}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className={s.orderHandle}
        {...attributes}
        {...listeners}
        disabled={busy}
        aria-label={`Přetáhnout projekt ${name}`}
      >
        <span aria-hidden>⠿</span>
      </button>
      <span className={s.orderNumber} aria-hidden>
        {index + 1}
      </span>
      <i
        className={s.orderColor}
        style={{ background: project.color || "#177d6b" }}
        aria-hidden
      />
      <span className={s.orderName}>
        <strong>{project.title}</strong>
        <small>{ownerName(project)}</small>
      </span>
      <div className={s.orderArrows}>
        <button
          aria-label={`Posunout projekt ${name} výš`}
          disabled={busy || index === 0}
          onClick={() => onMove(index - 1)}
        >
          ↑
        </button>
        <button
          aria-label={`Posunout projekt ${name} níž`}
          disabled={busy || index === total - 1}
          onClick={() => onMove(index + 1)}
        >
          ↓
        </button>
      </div>
    </li>
  );
}
