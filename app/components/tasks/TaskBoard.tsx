"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { User } from "@/lib/auth";
import type { Task } from "@/lib/tasks";
import type { BoardColumn, BoardSnapshot } from "@/lib/task-board";
import Modal from "./Modal";
import s from "./Board.module.css";
import ui from "./Workspace.module.css";

const automaticSortingStrategy = () => null;

type Props = {
  board: BoardSnapshot;
  tasks: Task[];
  manualOrder: boolean;
  user: User;
  onBoard: (b: BoardSnapshot) => void;
  onRefresh: () => Promise<void>;
  onNew: (id: string) => void;
  renderCard: (t: Task) => ReactNode;
};
export default function TaskBoard({
  board,
  tasks,
  manualOrder,
  user,
  onBoard,
  onRefresh,
  onNew,
  renderCard,
}: Props) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [preview, setPreview] = useState<BoardSnapshot | null>(null);
  const [edit, setEdit] = useState<{
      kind: "create" | "rename" | "delete";
      column?: BoardColumn;
    } | null>(null),
    [title, setTitle] = useState(""),
    [destination, setDestination] = useState("");
  const initial = useRef(board);
  const editColumns = board.can_edit_columns ?? user.role === "OWNER";
  const visible = preview ?? board;
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const placementByTask = useMemo(
    () =>
      new Map(
        visible.placements.map((placement) => [placement.task_id, placement]),
      ),
    [visible.placements],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const canMove = (t: Task) =>
    !busy &&
    !t.archived_at &&
    (board.project_id
      ? !!board.can_edit_columns
      : user.role === "OWNER" ||
        t.created_by === user.displayName ||
        t.task_assignments.some((a) => a.assignee === user.displayName));
  const collision: CollisionDetection = (args) => {
    if (args.active.data.current?.kind === "column")
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.kind === "column",
        ),
      });
    const hits = pointerWithin(args);
    const card = hits.find((h) => String(h.id).startsWith("t:"));
    return card ? [card] : hits.length ? hits : closestCenter(args);
  };
  async function run(
    action: string,
    data: Record<string, unknown>,
    optimistic?: BoardSnapshot,
    revision = board.revision,
  ) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    if (optimistic) setPreview(optimistic);
    try {
      const res = await fetch("/api/task-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision,
          project_id: board.project_id,
          ...data,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error);
      onBoard(result);
      setNotice("Uloženo");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Změnu se nepodařilo uložit.");
      await onRefresh();
      return false;
    } finally {
      setBusy(false);
      setPreview(null);
    }
  }
  function moveTask(
    taskId: string,
    columnId: string,
    beforeId?: string,
    base = board,
  ) {
    const placements = base.placements.filter((p) => p.task_id !== taskId);
    const following = placements.find((p) => p.task_id === beforeId);
    const rest = placements.filter((p) => p.column_id === columnId);
    const previous = following
      ? Math.max(
          following.position - 2048,
          ...rest
            .filter((p) => p.position < following.position)
            .map((p) => p.position),
        )
      : Math.max(0, ...rest.map((p) => p.position));
    placements.push({
      task_id: taskId,
      column_id: columnId,
      position: following
        ? (previous + following.position) / 2
        : previous + 1024,
    });
    void run(
      "move_task",
      { task_id: taskId, column_id: columnId, before_id: beforeId ?? null },
      { ...base, placements },
      base.revision,
    );
  }
  function moveColumn(id: string, to: number, base = board) {
    const from = base.columns.findIndex((c) => c.id === id);
    if (from === to || to < 0 || to >= base.columns.length) return;
    const columns = arrayMove(base.columns, from, to);
    void run(
      "move_column",
      { column_id: id, before_id: columns[to + 1]?.id ?? null },
      { ...base, columns },
      base.revision,
    );
  }
  function end({ active, over }: DragEndEvent) {
    setDrag(null);
    if (!over || active.id === over.id) return;
    const base = initial.current;
    if (active.data.current?.kind === "column") {
      const i = base.columns.findIndex((c) => "c:" + c.id === over.id);
      if (i >= 0) moveColumn(String(active.id).slice(2), i, base);
      return;
    }
    const id = String(active.id).slice(2);
    const target = String(over.id);
    const overPlacement = base.placements.find(
      (p) => "t:" + p.task_id === target,
    );
    const cid = overPlacement?.column_id ?? target.slice(2);
    if (!base.columns.some((c) => c.id === cid)) return;
    if (!manualOrder) {
      // Date sorting is personal. Only a move between columns changes shared data.
      if (base.placements.find((p) => p.task_id === id)?.column_id !== cid)
        moveTask(id, cid, undefined, base);
      return;
    }
    let before = overPlacement?.task_id;
    const ordered = base.placements
      .filter((p) => p.column_id === cid)
      .sort((a, b) => a.position - b.position);
    const from = ordered.findIndex((p) => p.task_id === id),
      to = ordered.findIndex((p) => p.task_id === before);
    if (from >= 0 && to > from) before = ordered[to + 1]?.task_id;
    moveTask(id, cid, before, base);
  }
  const editColumn = (
    kind: "create" | "rename" | "delete",
    column?: BoardColumn,
  ) => {
    setError("");
    setEdit({ kind, column });
    setTitle(column?.title ?? "");
    setDestination(board.columns.find((c) => c.id !== column?.id)?.id ?? "");
  };
  return (
    <>
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <div className={s.saving} data-hint={!busy && !notice} role="status">
        {busy
          ? "Ukládání změny…"
          : notice ||
            (manualOrder
              ? "Přetáhněte kartu za úchyt. Sloupce lze uspořádat za úchyt v záhlaví."
              : "Úkoly se řadí automaticky v každém sloupci. Přetažením změníte sloupec; pro vlastní pořadí zvolte Ruční pořadí.")}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => {
          initial.current = board;
          setDrag(String(e.active.id));
        }}
        onDragCancel={() => setDrag(null)}
        onDragEnd={end}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Mezerníkem uchopte. Šipkami přesuňte. Mezerníkem pusťte, Escape zruší přesun.",
          },
        }}
      >
        <SortableContext
          items={visible.columns.map((c) => "c:" + c.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className={s.board}
            data-dragging={!!drag}
            aria-label="Nástěnka úkolů"
          >
            {visible.columns.map((c, index) => {
              const entries = visible.placements
                .filter((p) => p.column_id === c.id)
                .sort(
                  (a, b) =>
                    a.position - b.position ||
                    a.task_id.localeCompare(b.task_id),
                );
              const cards = manualOrder
                ? entries
                    .map((p) => taskById.get(p.task_id))
                    .filter((t): t is Task => !!t)
                : tasks.filter(
                    (t) => placementByTask.get(t.id)?.column_id === c.id,
                  );
              return (
                <Column
                  key={c.id}
                  column={c}
                  count={cards.length}
                  disabled={busy || !editColumns}
                  onEdit={() => editColumn("rename", c)}
                  onDelete={() => editColumn("delete", c)}
                  onLeft={() => moveColumn(c.id, index - 1)}
                  onRight={() => moveColumn(c.id, index + 1)}
                  first={index === 0}
                  last={index === visible.columns.length - 1}
                >
                  <SortableContext
                    items={cards.map((t) => "t:" + t.id)}
                    strategy={
                      manualOrder
                        ? verticalListSortingStrategy
                        : automaticSortingStrategy
                    }
                  >
                    {cards.map((t) => (
                      <Card
                        key={t.id}
                        task={t}
                        disabled={!canMove(t)}
                        columns={visible.columns}
                        column={c.id}
                        onMove={(column) => moveTask(t.id, column)}
                      >
                        {renderCard(t)}
                      </Card>
                    ))}
                  </SortableContext>
                  {!cards.length && (
                    <div className={s.empty}>Sem přetáhněte úkol</div>
                  )}
                  <button
                    className={s.addTask}
                    disabled={busy}
                    onClick={() => onNew(c.id)}
                  >
                    + Přidat úkol
                  </button>
                </Column>
              );
            })}
            {editColumns && (
              <button
                className={s.addColumn}
                disabled={busy}
                onClick={() => editColumn("create")}
              >
                + Přidat sloupec
              </button>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {drag && (
            <div className={s.overlay}>
              {drag.startsWith("t:") ? (
                (() => {
                  const t = tasks.find((t) => "t:" + t.id === drag);
                  return t ? renderCard(t) : null;
                })()
              ) : (
                <div className={s.column}>
                  {board.columns.find((c) => "c:" + c.id === drag)?.title}
                </div>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {edit && (
        <Modal
          title={
            edit.kind === "create"
              ? "Nový sloupec"
              : edit.kind === "rename"
                ? "Přejmenovat sloupec"
                : "Odstranit sloupec"
          }
          busy={busy}
          onClose={() => setEdit(null)}
        >
          <form
            className={ui.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                edit.kind === "create"
                  ? "create_column"
                  : edit.kind === "rename"
                    ? "rename_column"
                    : "delete_column",
                {
                  column_id: edit.column?.id,
                  title,
                  destination_id: destination,
                },
              );
              if (ok) setEdit(null);
            }}
          >
            {error && (
              <p className={ui.formError} role="alert">
                {error}
              </p>
            )}
            {edit.kind === "delete" ? (
              <>
                <p>
                  Úkoly ze sloupce „{edit.column?.title}“ se přesunou do
                  vybraného sloupce. Přesun zahrne i úkoly skryté aktuálním
                  filtrem.
                </p>
                <label className={ui.field}>
                  Přesunout úkoly do
                  <select
                    className={ui.select}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                    disabled={busy}
                  >
                    {board.columns
                      .filter((c) => c.id !== edit.column?.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <label className={ui.field}>
                Název sloupce
                <input
                  autoFocus
                  className={ui.input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={80}
                  disabled={busy}
                />
              </label>
            )}
            <footer className={ui.formFooter}>
              <button
                className={ui.quiet}
                type="button"
                onClick={() => setEdit(null)}
                disabled={busy}
              >
                Zrušit
              </button>
              <button
                className={ui.primary}
                disabled={
                  busy || (edit.kind === "delete" && board.columns.length < 2)
                }
              >
                {edit.kind === "delete"
                  ? "Přesunout úkoly a odstranit sloupec"
                  : "Uložit"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function Column({
  column,
  count,
  disabled,
  children,
  onEdit,
  onDelete,
  onLeft,
  onRight,
  first,
  last,
}: {
  column: BoardColumn;
  count: number;
  disabled: boolean;
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onLeft: () => void;
  onRight: () => void;
  first: boolean;
  last: boolean;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: "c:" + column.id,
    data: { kind: "column" },
    disabled: { draggable: disabled, droppable: false },
  });
  const [menu, setMenu] = useState(false);
  return (
    <section
      ref={setNodeRef}
      aria-label={`Sloupec ${column.title}`}
      className={s.column}
      data-over={isOver}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <div className={s.columnHeader}>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Přetáhnout sloupec ${column.title}`}
          className={s.handle}
        >
          ⠿
        </button>
        <strong
          className={s.columnTitle}
          onDoubleClick={() => {
            if (!disabled) onEdit();
          }}
        >
          {column.title}
        </strong>
        <span className={s.count}>{count}</span>
        {!disabled && (
          <div className={s.menu}>
            <button
              aria-label={`Upravit sloupec ${column.title}`}
              aria-expanded={menu}
              className={s.menuButton}
              onClick={() => setMenu(!menu)}
            >
              ⋯
            </button>
            {menu && (
              <div
                className={s.menuPopup}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setMenu(false);
                }}
              >
                <button
                  onClick={() => {
                    setMenu(false);
                    onEdit();
                  }}
                >
                  Přejmenovat
                </button>
                <button
                  disabled={first}
                  onClick={() => {
                    setMenu(false);
                    onLeft();
                  }}
                >
                  Posunout vlevo
                </button>
                <button
                  disabled={last}
                  onClick={() => {
                    setMenu(false);
                    onRight();
                  }}
                >
                  Posunout vpravo
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                >
                  Odstranit sloupec…
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
function Card({
  task,
  disabled,
  children,
  columns,
  column,
  onMove,
}: {
  task: Task;
  disabled: boolean;
  children: ReactNode;
  columns: BoardColumn[];
  column: string;
  onMove: (id: string) => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: "t:" + task.id,
    data: { kind: "task" },
    disabled: { draggable: disabled, droppable: false },
  });
  return (
    <div
      ref={setNodeRef}
      className={s.cardWrap}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.25 : 1,
      }}
    >
      {children}
      {!disabled && (
        <div className={s.cardTools}>
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className={s.handle}
            aria-label={`Přetáhnout úkol ${task.title}`}
          >
            ⠿
          </button>
          <select
            className={s.moveSelect}
            aria-label={`Přesunout úkol ${task.title} do sloupce`}
            value={column}
            onChange={(e) => onMove(e.target.value)}
          >
            <option value={column} hidden>
              ↪
            </option>
            {columns
              .filter((c) => c.id !== column)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
