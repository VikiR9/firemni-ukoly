"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@/lib/auth";
import {
  PRIORITY,
  actionLabel,
  availableActions,
  canManage,
  canOrganize,
  dateLabel,
  describeError,
  overdue,
  timestampLabel,
  type Assignment,
  type Task,
  type TaskStatus,
  type TaskUpdate,
} from "@/lib/tasks";
import Modal from "./Modal";
import { Avatar, Badge, type Mutation } from "./TaskDialogs";
import s from "./Workspace.module.css";

export default function TaskDetail({
  task,
  user,
  mutate,
  onClose,
  onEdit,
  onHandoff,
  onNotice,
  onAccept,
}: {
  task: Task;
  user: User;
  mutate: Mutation;
  onClose: () => void;
  onEdit: () => void;
  onHandoff: () => void;
  onNotice: (text: string) => void;
  onAccept?: () => void;
}) {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"task" | "activity">("task");
  const [pending, setPending] = useState<{
    assignment: Assignment;
    status: TaskStatus;
  } | null>(null);
  const [note, setNote] = useState("");
  const [reminder, setReminder] = useState("");
  const commentId = useRef<string | null>(null);
  const formId = useId();
  const actionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pending) actionHeading.current?.focus();
  }, [pending]);
  const loadUpdates = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("task_updates")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false });
    if (e) setHistoryError(describeError(e));
    else {
      setUpdates(data ?? []);
      setHistoryError("");
    }
    setHistoryLoading(false);
  }, [task.id]);
  useEffect(() => {
    void loadUpdates();
  }, [loadUpdates, task.updated_at]);
  const run = async (action: string, data: Record<string, unknown> = {}) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await mutate(action, task.id, data);
      await loadUpdates();
      setPending(null);
      setNote("");
      setReminder("");
      onNotice(
        action === "comment" ? "Aktualizace je uložená." : "Změna je uložená.",
      );
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const transition = (assignment: Assignment, status: TaskStatus) => {
    if (status === "ACCEPTED" && onAccept) {
      onAccept();
      return;
    }
    setError("");
    setPending({ assignment, status });
    setNote("");
    setReminder("");
  };
  const submitTransition = async (e: FormEvent) => {
    e.preventDefault();
    if (pending)
      await run("transition", {
        assignee: pending.assignment.assignee,
        status: pending.status,
        expected_status: pending.assignment.status,
        note,
        reminder_on: reminder,
      });
  };
  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || busy) return;
    commentId.current ??= crypto.randomUUID();
    if (await run("comment", { note: comment, id: commentId.current })) {
      setComment("");
      commentId.current = null;
    }
  };
  const manageable = canManage(task, user) && !task.archived_at;
  const organizable = canOrganize(task, user);
  const mine = task.task_assignments.find(
    (a) => a.assignee === user.displayName,
  );
  const myActions = mine ? availableActions(task, mine, user) : [];
  const primaryAction = myActions.find((a) =>
    ["ACCEPTED", "DONE", "SUBMITTED_DONE"].includes(a),
  );
  const sourceAt = task.description?.indexOf("Původní úkol v Asaně:") ?? -1;
  const description =
    sourceAt >= 0
      ? task.description!.slice(0, sourceAt).trim()
      : task.description;
  const source = sourceAt >= 0 ? task.description!.slice(sourceAt) : "";
  return (
    <Modal
      title={pending ? "Změnit stav" : "Detail úkolu"}
      onClose={pending ? () => setPending(null) : onClose}
      busy={busy}
      footer={
        pending ? (
          <>
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Zpět
            </button>
            <button
              className={s.primary}
              type="submit"
              form={formId}
              disabled={busy}
            >
              {busy ? "Ukládání…" : "Potvrdit změnu"}
            </button>
          </>
        ) : manageable || organizable || primaryAction ? (
          <>
            {(manageable || organizable) && (
              <button className={s.secondary} disabled={busy} onClick={onEdit}>
                {manageable ? "Upravit" : "Upravit moje zařazení"}
              </button>
            )}
            {manageable && (
              <button
                className={primaryAction ? s.secondary : s.primary}
                disabled={busy}
                onClick={onHandoff}
              >
                Předat kolegovi <span aria-hidden>↗</span>
              </button>
            )}
            {mine && primaryAction && (
              <button
                className={s.primary}
                disabled={busy}
                onClick={() => transition(mine, primaryAction)}
              >
                {primaryAction === "ACCEPTED" && onAccept
                  ? "Přijmout"
                  : actionLabel(primaryAction, mine.status)}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {pending ? (
        <form id={formId} className={s.form} onSubmit={submitTransition}>
          <p className={s.contextTitle}>{task.title}</p>
          <h3 className={s.actionTitle} ref={actionHeading} tabIndex={-1}>
            {actionLabel(pending.status, pending.assignment.status)}
          </h3>
          <p className={s.subtitle}>Řešitel: {pending.assignment.assignee}</p>
          <label className={s.field}>
            <span className={s.fieldLabel}>
              {["BLOCKED", "RETURNED", "DECLINED"].includes(pending.status)
                ? "Důvod / na co čekáte"
                : "Poznámka k postupu (volitelná)"}
            </span>
            <textarea
              className={s.textarea}
              rows={4}
              required={["BLOCKED", "RETURNED", "DECLINED"].includes(
                pending.status,
              )}
              value={note}
              maxLength={6000}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {pending.status === "BLOCKED" && (
            <label className={s.field}>
              <span className={s.fieldLabel}>Připomenout další krok</span>
              <input
                type="date"
                className={s.input}
                value={reminder}
                disabled={busy}
                onChange={(e) => setReminder(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className={s.formError} role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className={s.taskHero}>
            <h3>{task.title}</h3>
            <div className={s.taskFacts}>
              <span className={overdue(task) ? s.late : ""}>
                ◷ {dateLabel(task.due)}
              </span>
              <span>{PRIORITY[task.priority]} priorita</span>
            </div>
          </div>
          <div className={s.detailTabs} role="group" aria-label="Obsah detailu">
            <button
              aria-pressed={tab === "task"}
              onClick={() => setTab("task")}
            >
              Zadání a řešitelé
            </button>
            <button
              aria-pressed={tab === "activity"}
              onClick={() => setTab("activity")}
            >
              Aktualizace <span>{updates.length}</span>
            </button>
          </div>
          {error && (
            <p className={s.formError} role="alert">
              {error}
            </p>
          )}
          {tab === "task" ? (
            <div className={s.detailMain}>
              {task.archived_at && (
                <div className={s.notice}>Úkol je v archivu.</div>
              )}
              <section className={s.detailSection}>
                <h3>Kdo na úkolu pracuje</h3>
                {task.task_assignments.map((a) => (
                  <div className={s.assignment} key={a.assignee}>
                    <div className={s.assignmentHead}>
                      <Avatar name={a.assignee} />
                      <strong>
                        {a.assignee}
                        {a.assignee === user.displayName ? " · vy" : ""}
                      </strong>
                      <Badge status={a.status} />
                    </div>
                    {a.reminder_on && (
                      <p className={s.subtitle}>
                        Připomenout: {dateLabel(a.reminder_on)}
                      </p>
                    )}
                    {!!availableActions(task, a, user).length && (
                      <div className={s.actions}>
                        {availableActions(task, a, user)
                          .filter(
                            (status) =>
                              !(a === mine && status === primaryAction),
                          )
                          .map((status) => (
                            <button
                              key={status}
                              disabled={busy}
                              className={s.secondary}
                              onClick={() => transition(a, status)}
                            >
                              {actionLabel(status, a.status)}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
                {!task.task_assignments.length && (
                  <p className={s.subtitle}>Zatím bez řešitele.</p>
                )}
              </section>
              <section className={s.detailSection}>
                <h3>Zadání</h3>
                <p className={s.description}>
                  {description || "K tomuto úkolu zatím není připojený popis."}
                </p>
              </section>
              <details className={s.moreDetails}>
                <summary>Další informace o úkolu</summary>
                <div className={s.metadata}>
                  <div>
                    <span>Zadavatel</span>
                    <strong>{task.created_by || "Původní zadání"}</strong>
                  </div>
                  <div>
                    <span>Dokončení</span>
                    <strong>
                      {task.requires_approval
                        ? "S kontrolou majitele"
                        : "Bez schvalování"}
                    </strong>
                  </div>
                </div>
                {source && <p className={s.description}>{source}</p>}
                <p className={s.bottomNote}>
                  Vytvořeno {timestampLabel(task.created_at)}
                </p>
                {canManage(task, user) && (
                  <button
                    className={s.secondary}
                    disabled={busy}
                    onClick={() =>
                      void run(task.archived_at ? "restore" : "archive")
                    }
                  >
                    {task.archived_at
                      ? "Obnovit z archivu"
                      : "Přesunout do archivu"}
                  </button>
                )}
              </details>
            </div>
          ) : (
            <div className={s.detailAside}>
              <form className={s.commentBox} onSubmit={addComment}>
                <label className={s.field}>
                  <span className={s.fieldLabel}>Nová aktualizace</span>
                  <textarea
                    className={s.textarea}
                    rows={3}
                    placeholder="Jak úkol postupuje?"
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      commentId.current = null;
                    }}
                    maxLength={6000}
                    required
                    disabled={busy}
                  />
                </label>
                <button
                  className={s.primary}
                  disabled={busy || !comment.trim()}
                >
                  {busy ? "Ukládání…" : "Přidat aktualizaci"}
                </button>
              </form>
              {historyError && (
                <div className={s.notice} role="alert">
                  {historyError}
                  <button onClick={() => void loadUpdates()}>Znovu</button>
                </div>
              )}
              {historyLoading ? (
                <p className={s.loading}>Načítám historii…</p>
              ) : (
                <div className={s.timeline}>
                  {updates.map((update) => (
                    <article
                      className={`${s.update} ${update.kind === "event" ? s.event : ""}`}
                      key={update.id}
                    >
                      <header className={s.updateHeader}>
                        <strong>{update.author}</strong>
                        <time dateTime={update.created_at}>
                          {timestampLabel(update.created_at)}
                        </time>
                      </header>
                      <p>{update.body}</p>
                    </article>
                  ))}
                  {!updates.length && (
                    <p className={s.subtitle}>
                      Zatím žádné aktualizace. Napište první.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
