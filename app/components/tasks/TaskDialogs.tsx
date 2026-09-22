"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { type User } from "@/lib/auth";
import {
  PRIORITY,
  STATUS,
  describeError,
  todayISO,
  type Priority,
  type TaskDraft,
  type TaskStatus,
  type TaskPlacementChange,
} from "@/lib/tasks";
import Modal from "./Modal";
import PeoplePicker from "./PeoplePicker";
import type { BoardSnapshot } from "@/lib/task-board";
import TaskPlacementFields from "./TaskPlacementFields";
import s from "./Workspace.module.css";
export type Mutation = (
  action: string,
  id: string,
  data?: Record<string, unknown>,
) => Promise<void>;
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  return (
    <span title={name} className={`${s.avatar} ${large ? s.avatarLarge : ""}`}>
      {name.slice(0, 1)}
    </span>
  );
}
export function Badge({ status }: { status: TaskStatus }) {
  return (
    <span className={s.badge} data-status={status}>
      {STATUS[status]}
    </span>
  );
}

export function TaskEditor({
  projects = [],
  canEditContent = true,
  canEditPlacement = true,
  initial,
  isNew,
  user,
  mutate,
  onClose,
  onSaved,
}: {
  projects?: NonNullable<BoardSnapshot["projects"]>;
  canEditContent?: boolean;
  canEditPlacement?: boolean;
  initial: TaskDraft;
  isNew: boolean;
  user: User;
  mutate: Mutation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const [placement, setPlacement] = useState<TaskPlacementChange | null>(null);
  const updatePlacementDraft = useCallback(
    (project_id: string | null, column_id: string) => {
      if (isNew) setDraft((d) => ({ ...d, project_id, column_id }));
    },
    [isNew],
  );
  const formId = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (discard || error) feedback.current?.focus();
  }, [discard, error]);
  const sourceAt = draft.description.indexOf("Původní úkol v Asaně:");
  const source = sourceAt >= 0 ? draft.description.slice(sourceAt) : "";
  const close = () => {
    if (
      !isNew &&
      (JSON.stringify(draft) !== JSON.stringify(initial) ||
        (placement &&
          (placement.project_id !== placement.source_project_id ||
            placement.column_id !== placement.source_column_id)))
    )
      setDiscard(true);
    else onClose();
  };
  const change = (patch: Partial<TaskDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  useEffect(() => {
    if (isNew)
      try {
        sessionStorage.setItem(
          `limmit:task-draft:${user.username}`,
          JSON.stringify(draft),
        );
      } catch {}
  }, [draft, isNew, user.username]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (canEditContent && !draft.assignees.length) {
      setError("Vyberte alespoň jednoho řešitele.");
      return;
    }
    if (canEditPlacement && !placement) {
      setError("Nejprve vyberte dostupný projekt a sloupec.");
      return;
    }
    setBusy(true);
    try {
      await mutate(
        isNew ? "create" : canEditContent ? "edit" : "organize",
        draft.id,
        { ...draft, ...(canEditPlacement ? { placement } : {}) },
      );
      if (isNew)
        try {
          sessionStorage.removeItem(`limmit:task-draft:${user.username}`);
        } catch {}
      onSaved();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        isNew
          ? "Nový úkol"
          : canEditContent
            ? "Upravit zadání"
            : "Upravit moje zařazení"
      }
      onClose={close}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            onClick={close}
          >
            Zpět
          </button>
          <button
            className={s.primary}
            type="submit"
            form={formId}
            disabled={busy || (canEditPlacement && !placement)}
          >
            {busy ? "Ukládání…" : isNew ? "Vytvořit úkol" : "Uložit změny"}
          </button>
        </>
      }
    >
      <form id={formId} className={s.form} onSubmit={save}>
        {(discard || error) && (
          <div ref={feedback} tabIndex={-1}>
            {discard && (
              <div className={s.discardNotice} role="alert">
                <strong>Máte neuložené změny</strong>
                <p>Chcete se vrátit k úpravě, nebo změny zahodit?</p>
                <div className={s.actions}>
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => setDiscard(false)}
                  >
                    Pokračovat v úpravě
                  </button>
                  <button
                    type="button"
                    className={s.secondary}
                    onClick={onClose}
                  >
                    Zahodit změny
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className={s.formError} role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        {canEditPlacement && (
          <TaskPlacementFields
            taskId={draft.id}
            isNew={isNew}
            initialProjectId={initial.project_id}
            initialColumnId={initial.column_id}
            projects={projects}
            user={user}
            busy={busy}
            onChange={setPlacement}
            onDraftChange={updatePlacementDraft}
          />
        )}
        {!canEditContent && (
          <p className={s.savedDraft}>
            Upravujete své zařazení. Společné zadání může změnit autor nebo
            majitel.
          </p>
        )}
        <fieldset disabled={busy || !canEditContent}>
          <div className={s.field}>
            <label htmlFor="task-title">Co je potřeba udělat?</label>
            <textarea
              id="task-title"
              name="title"
              rows={2}
              className={s.textarea}
              placeholder="Např. Připravit nabídku pro klienta"
              maxLength={200}
              required
              value={draft.title}
              onChange={(e) =>
                change({ title: e.target.value.replace(/\n/g, " ") })
              }
            />
          </div>
          <div className={s.field}>
            <span className={s.fieldLabel}>Řešitelé</span>
            <PeoplePicker
              inline
              value={draft.assignees}
              onChange={(assignees) => change({ assignees })}
              disabled={busy}
            />
          </div>
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor="task-due">Termín dokončení</label>
              <input
                id="task-due"
                type="date"
                className={s.input}
                value={draft.due}
                onChange={(e) => change({ due: e.target.value })}
              />
              <div className={s.dateShortcuts}>
                <button
                  type="button"
                  onClick={() => change({ due: todayISO() })}
                >
                  Dnes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    change({
                      due: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`,
                    });
                  }}
                >
                  Zítra
                </button>
                {draft.due && (
                  <button type="button" onClick={() => change({ due: "" })}>
                    Bez termínu
                  </button>
                )}
              </div>
            </div>
            <div className={s.field}>
              <label htmlFor="task-priority">Priorita</label>
              <select
                id="task-priority"
                className={s.select}
                value={draft.priority}
                onChange={(e) =>
                  change({ priority: e.target.value as Priority })
                }
              >
                {Object.entries(PRIORITY).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={s.field}>
            <label htmlFor="task-description">
              Zadání a očekávaný výsledek
            </label>
            <textarea
              id="task-description"
              className={s.textarea}
              placeholder="Kontext, podklady nebo popis hotového výsledku…"
              rows={3}
              maxLength={12000 - (source ? source.length + 2 : 0)}
              value={
                sourceAt >= 0
                  ? draft.description.slice(0, sourceAt).replace(/\n\n$/, "")
                  : draft.description
              }
              onChange={(e) =>
                change({
                  description: e.target.value + (source ? `\n\n${source}` : ""),
                })
              }
            />
            {source && (
              <details className={s.moreDetails}>
                <summary>Původní údaje z Asany</summary>
                <p className={s.description}>{source}</p>
              </details>
            )}
          </div>
          <label className={s.approval}>
            <input
              type="checkbox"
              checked={draft.requires_approval}
              onChange={(e) => change({ requires_approval: e.target.checked })}
            />
            <span>
              <strong>Vyžadovat schválení Viktorem</strong>
              <small>
                {draft.requires_approval
                  ? "Dokončení každého řešitele zkontroluje Milan nebo Viktor."
                  : "Po dokončení bude úkol rovnou hotový. Bez čekání na schválení."}
              </small>
            </span>
          </label>
          {isNew && (
            <p className={s.savedDraft}>
              Rozepsaný návrh se automaticky zachovává.
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
