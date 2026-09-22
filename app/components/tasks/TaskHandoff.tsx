"use client";
import { useId, useState, type FormEvent } from "react";
import { getAllUsers, type User } from "@/lib/auth";
import { describeError, type Task } from "@/lib/tasks";
import { Avatar, type Mutation } from "./TaskDialogs";
import Modal from "./Modal";
import s from "./Workspace.module.css";

export default function TaskHandoff({
  task,
  user,
  mutate,
  onClose,
  onSaved,
}: {
  task: Task;
  user: User;
  mutate: Mutation;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [from, setFrom] = useState(
    task.task_assignments.find((a) => a.assignee === user.displayName)
      ?.assignee ||
      task.task_assignments[0]?.assignee ||
      "",
  );
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const assigned = task.task_assignments.map((a) => a.assignee);
  const people = getAllUsers().filter((u) => !assigned.includes(u.displayName));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !to || !people.some((u) => u.displayName === to)) return;
    if (assigned.length && !assigned.includes(from)) {
      setError("Řešitelé se mezitím změnili. Otevřete předání znovu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutate("edit", task.id, {
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        due: task.due || "",
        requires_approval: task.requires_approval,
        assignees: assigned.length
          ? assigned.map((name) => (name === from ? to : name))
          : [to],
      });
      onSaved(to);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Předat úkol"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className={s.secondary}
            onClick={onClose}
            disabled={busy}
          >
            Zpět
          </button>
          <button
            className={s.primary}
            type="submit"
            form={formId}
            disabled={busy || !to}
          >
            {busy ? "Předávám…" : "Potvrdit předání"}
          </button>
        </>
      }
    >
      <form id={formId} className={s.form} onSubmit={save}>
        <p className={s.contextTitle}>{task.title}</p>
        {assigned.length > 1 && (
          <label className={s.field}>
            <span className={s.fieldLabel}>Koho nový řešitel nahradí?</span>
            <select
              className={s.select}
              value={from}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
            >
              {assigned.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <div className={s.handoffPreview} aria-live="polite">
          <div>
            <Avatar name={from || "?"} />
            <strong>{from || "Bez řešitele"}</strong>
          </div>
          <span aria-hidden>→</span>
          <div>
            <Avatar name={to || "?"} />
            <strong>{to || "Vyberte kolegu"}</strong>
          </div>
        </div>
        <fieldset className={s.recipientFieldset} disabled={busy}>
          <legend>Komu úkol předat?</legend>
          <div className={s.recipientGrid}>
            {people.map((u) => (
              <label key={u.username} data-selected={to === u.displayName}>
                <input
                  type="radio"
                  name="recipient"
                  value={u.displayName}
                  checked={to === u.displayName}
                  onChange={() => setTo(u.displayName)}
                  required
                />
                <Avatar name={u.displayName} />
                <span>
                  {u.displayName}
                  {u.username === user.username ? " (já)" : ""}
                </span>
              </label>
            ))}
          </div>
          {!people.length && (
            <p className={s.subtitle}>
              Všichni kolegové už jsou mezi řešiteli.
            </p>
          )}
        </fieldset>
        <p className={s.handoffHint}>
          {to === user.displayName
            ? "Úkol převezmete rovnou do své práce."
            : "Novému řešiteli se úkol objeví v Příchozích k přijetí."}
          {assigned.length > 1 ? " Ostatní řešitelé zůstávají." : ""} Zadání,
          termín a projekt se nemění.
        </p>
        {error && (
          <p className={s.formError} role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
