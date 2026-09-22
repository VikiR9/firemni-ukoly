"use client";
import { LimmitLogo } from "@/lib/logo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearSession, getAllUsers, loadSession, type User } from "@/lib/auth";
import {
  STATUS,
  PRIORITY,
  TASK_SORT_LABELS,
  parseTaskSorts,
  taskSortContext,
  sortTasks,
  todayISO,
  dateLabel,
  complete,
  overdue,
  statusFor,
  describeError,
  canManage,
  canOrganize,
  type Task,
  type TaskDraft,
  type TaskSort,
  type TaskView,
} from "@/lib/tasks";
import { Avatar, Badge, TaskEditor } from "./TaskDialogs";
import TaskDetail from "./TaskDetail";
import TaskHandoff from "./TaskHandoff";
import InstallApp from "./InstallApp";
import PushNotifications from "../PushNotifications";
import TaskBoard from "./TaskBoard";
import ProjectPicker from "./ProjectPicker";
import TaskCalendar from "./TaskCalendar";
import CompletionCelebration from "./CompletionCelebration";
import TaskInbox, { inInbox } from "./TaskInbox";
import ProjectLabels from "./ProjectLabels";
import TeamAvailability from "./TeamAvailability";
import type { BoardSnapshot } from "@/lib/task-board";
import s from "./Workspace.module.css";
const USERS = getAllUsers();
type Filter = "active" | "today" | "overdue" | "review" | "done";
type IconName =
  "grid" | "list" | "search" | "calendar" | "team" | "check" | "plus";
function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      ) : name === "grid" ? (
        <>
          <rect x="3" y="4" width="7" height="16" rx="2" />
          <rect x="14" y="4" width="7" height="16" rx="2" />
        </>
      ) : name === "list" ? (
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      ) : name === "calendar" ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M7 3v4M17 3v4M3 11h18" />
        </>
      ) : name === "team" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M19 15c2 1 2 3 2 6" />
        </>
      ) : name === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : (
        <path d="m5 12 4 4L19 6" />
      )}
    </svg>
  );
}
const TABS: { key: Filter; label: string }[] = [
  { key: "active", label: "Aktivní" },
  { key: "today", label: "Dnes" },
  { key: "overdue", label: "Po termínu" },
  { key: "review", label: "Ke schválení" },
  { key: "done", label: "Hotovo / Archiv" },
];

export default function TaskWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true);
  const [scope, setScope] = useState("ME"),
    [filter, setFilter] = useState<Filter>("active"),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [priorityFilter, setPriorityFilter] = useState("all"),
    [sortPreferences, setSortPreferences] = useState<Record<string, TaskSort>>(
      {},
    ),
    [view, setView] = useState<TaskView>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [editor, setEditor] = useState<{ draft: TaskDraft; isNew: boolean } | null>(
      null,
    ),
    [toast, setToast] = useState("");
  const [celebration, setCelebration] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const endCelebration = useCallback(() => setCelebration(0), []);
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [boardError, setBoardError] = useState("");
  const [projectId, setProjectId] = useState("");
  const sortContext = taskSortContext(projectId, scope, filter, view);
  const savedSort = sortPreferences[sortContext];
  const sort =
    savedSort && (savedSort !== "manual" || view === "board")
      ? savedSort
      : view === "board"
        ? "manual"
        : "due";
  function changeSort(value: TaskSort) {
    const next = { ...sortPreferences, [sortContext]: value };
    setSortPreferences(next);
    if (user) {
      try {
        localStorage.setItem(
          "limmit:task-sorts:v1:" + user.username,
          JSON.stringify(next),
        );
      } catch {
        /* Sorting still works when browser storage is unavailable. */
      }
    }
  }
  const projectRef = useRef("");
  const acceptBoard = useCallback((result: BoardSnapshot) => {
    if ((result.project_id || "") === projectRef.current) setBoard(result);
  }, []);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const requestedProject = projectRef.current;
    const [{ data, error: e }, initialBoardResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("*,task_assignments(*)")
        .order("created_at", { ascending: false }),
      fetch(
        "/api/task-board?project_id=" + encodeURIComponent(requestedProject),
        { cache: "no-store" },
      )
        .then(async (r) => ({ ok: r.ok, data: await r.json() }))
        .catch(() => ({
          ok: false,
          data: { error: "Nástěnka není dostupná." },
        })),
    ]);
    if (
      version !== refreshVersion.current ||
      requestedProject !== projectRef.current
    )
      return;
    let boardResult = initialBoardResult;
    if (
      requestedProject &&
      !boardResult.ok &&
      boardResult.data.code === "PROJECT_UNAVAILABLE"
    ) {
      boardResult = await fetch("/api/task-board", { cache: "no-store" })
        .then(async (r) => ({ ok: r.ok, data: await r.json() }))
        .catch(() => ({
          ok: false,
          data: { error: "Nástěnka není dostupná." },
        }));
      if (
        version !== refreshVersion.current ||
        requestedProject !== projectRef.current
      )
        return;
      if (boardResult.ok) {
        projectRef.current = "";
        setProjectId("");
        try {
          const session = loadSession();
          if (session)
            localStorage.removeItem("limmit:task-project:" + session.username);
        } catch {}
        setToast("Projekt už není dostupný. Zobrazujeme všechny úkoly.");
      }
    }
    if (boardResult.ok) {
      setBoard(boardResult.data);
      setBoardError("");
    } else setBoardError(boardResult.data.error);
    if (e) setError(describeError(e));
    else {
      setTasks((data ?? []) as Task[]);
      setError("");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    // Restore browser-only identity after hydration; the server renders a loading shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(session);
    const notificationParams = new URLSearchParams(window.location.search);
    const notificationTask = notificationParams.get("task");
    const overdueDigest = notificationParams.get("filter") === "overdue";
    if (notificationTask && /^[0-9a-f-]{36}$/i.test(notificationTask))
      setSelectedId(notificationTask);
    if (overdueDigest) {
      setFilter("overdue");
      setScope(session.displayName);
    }
    try {
      const savedProject = overdueDigest
        ? ""
        : localStorage.getItem("limmit:task-project:" + session.username) || "";
      projectRef.current = savedProject;
      setProjectId(savedProject);
      const saved = localStorage.getItem("limmit:task-view");
      if (saved === "list" || saved === "board" || saved === "calendar")
        setView(saved);
      else if (window.matchMedia("(max-width: 760px)").matches) setView("list");
      setSortPreferences(
        parseTaskSorts(
          localStorage.getItem("limmit:task-sorts:v1:" + session.username),
        ),
      );
    } catch {}
    setOnline(navigator.onLine);
    void refresh();
    const focus = () => {
        if (!document.hidden) void refresh();
      },
      on = () => {
        setOnline(true);
        void refresh();
      },
      off = () => setOnline(false);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const interval = setInterval(focus, 30000);
    const channel = supabase
      .channel("task-workspace")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      void supabase.removeChannel(channel);
    };
  }, [refresh, router]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const person = projectId
    ? undefined
    : scope === "ME"
      ? user?.displayName
      : ["TEAM", "CREATED"].includes(scope)
        ? undefined
        : scope;
  const scoped = useMemo(
    () =>
      tasks.filter((t) =>
        projectId
          ? !!board?.placements.some((p) => p.task_id === t.id)
          : scope === "CREATED"
            ? t.created_by === user?.displayName
            : !person ||
              t.task_assignments.some((a) => a.assignee === person) ||
              (scope === "ME" &&
                (t.created_by === user?.displayName ||
                  board?.project_memberships?.some(
                    (m) =>
                      m.task_id === t.id &&
                      board.projects?.some(
                        (p) =>
                          p.id === m.project_id &&
                          (p.owner_username === user?.username ||
                            p.member_usernames?.includes(user?.username || "")),
                      ),
                  ))),
      ),
    [tasks, person, scope, user?.displayName, user?.username, projectId, board],
  );
  const taskProjects = (id: string) =>
    (board?.projects || []).filter((p) =>
      board?.project_memberships?.some(
        (m) => m.project_id === p.id && m.task_id === id,
      ),
    );
  const today = todayISO();
  const finished = useCallback(
    (t: Task) =>
      person && t.task_assignments.some((a) => a.assignee === person)
        ? statusFor(t, person) === "DONE"
        : complete(t),
    [person],
  );
  const late = useCallback(
    (t: Task) =>
      !t.archived_at &&
      !finished(t) &&
      (!person || statusFor(t, person) !== "DECLINED") &&
      !!t.due &&
      t.due < today,
    [finished, person, today],
  );
  const dueToday = useCallback(
    (t: Task) =>
      !t.archived_at &&
      !finished(t) &&
      (t.due === today ||
        t.task_assignments.some(
          (a) =>
            (!person || a.assignee === person) &&
            !!a.reminder_on &&
            a.reminder_on <= today,
        )),
    [finished, today, person],
  );
  const inReview = useCallback(
    (t: Task) =>
      !t.archived_at &&
      t.task_assignments.some(
        (a) =>
          (!person || a.assignee === person) && a.status === "SUBMITTED_DONE",
      ),
    [person],
  );
  const counts = useMemo(
    () => ({
      active: scoped.filter((t) => !t.archived_at && !finished(t)).length,
      today: scoped.filter(dueToday).length,
      overdue: scoped.filter(late).length,
      review: scoped.filter(inReview).length,
      done: scoped.filter((t) => !!t.archived_at || finished(t)).length,
    }),
    [scoped, finished, dueToday, late, inReview],
  );
  const filtered = useMemo(
    () =>
      sortTasks(
        scoped.filter((t) => {
          if (
            filter === "done"
              ? !(t.archived_at || finished(t))
              : !!t.archived_at || finished(t)
          )
            return false;
          if (
            (filter === "active" && finished(t)) ||
            (filter === "overdue" && !late(t)) ||
            (filter === "today" && !dueToday(t)) ||
            (filter === "review" && !inReview(t))
          )
            return false;
          if (
            (statusFilter !== "all" && statusFor(t, person) !== statusFilter) ||
            (priorityFilter !== "all" && t.priority !== priorityFilter)
          )
            return false;
          return `${t.title} ${t.description || ""} ${t.created_by || ""} ${t.task_assignments.map((a) => a.assignee).join(" ")}`
            .toLocaleLowerCase("cs")
            .includes(query.toLocaleLowerCase("cs"));
        }),
        sort,
      ),
    [
      scoped,
      filter,
      finished,
      late,
      dueToday,
      inReview,
      statusFilter,
      priorityFilter,
      person,
      query,
      sort,
    ],
  );
  const switchScope = (value: string) => {
    if (projectRef.current) {
      projectRef.current = "";
      setProjectId("");
      setBoard(null);
      setLoading(true);
      try {
        localStorage.removeItem("limmit:task-project:" + user?.username);
      } catch {}
      void refresh();
    }
    setScope(value);
    setFilter("active");
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
  };
  const switchProject = (id: string) => {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    projectRef.current = id;
    setProjectId(id);
    setBoard(null);
    setLoading(true);
    setSelectedId(null);
    setScope("ME");
    setFilter("active");
    try {
      localStorage.setItem("limmit:task-project:" + user?.username, id);
    } catch {}
    void refresh();
  };
  const newTask = (columnId?: string, date?: string) => {
    if (!user) return;
    const currentProject = board?.projects?.find((p) => p.id === projectId);
    const useCurrentProject =
      currentProject &&
      (currentProject.owner_username === user.username ||
        currentProject.member_usernames?.includes(user.username));
    let draft: TaskDraft = {
      project_id: useCurrentProject ? projectId : null,
      id: crypto.randomUUID(),
      title: "",
      description: "",
      assignees: [
        USERS.some((u) => u.displayName === scope) ? scope : user.displayName,
      ],
      priority: "Medium",
      due: "",
      requires_approval: false,
    };
    try {
      const raw = sessionStorage.getItem(`limmit:task-draft:${user.username}`);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved.id &&
          typeof saved.title === "string" &&
          Array.isArray(saved.assignees)
        )
          draft = { ...draft, ...saved };
      }
    } catch {}
    if (columnId && (!projectId || useCurrentProject)) {
      draft.project_id = projectId || null;
      draft.column_id = columnId;
    }
    if (date) draft.due = date;
    setEditor({ isNew: true, draft });
  };
  const editTask = (t: Task) => {
    const available =
      board?.projects?.filter(
        (p) =>
          (p.owner_username === user?.username ||
            p.member_usernames?.includes(user?.username || "")) &&
          board.project_memberships?.some(
            (m) => m.task_id === t.id && m.project_id === p.id,
          ),
      ) || [];
    const source =
      available.find((p) => p.id === projectId) ||
      available.find((p) => p.owner_username === user?.username) ||
      available[0];
    setEditor({
      isNew: false,
      draft: {
        project_id: source?.id || null,
        column_id:
          (source?.id || "") === projectId
            ? board?.placements.find((p) => p.task_id === t.id)?.column_id
            : undefined,
        id: t.id,
        title: t.title,
        description: t.description || "",
        priority: t.priority,
        due: t.due || "",
        assignees: t.task_assignments.map((a) => a.assignee),
        requires_approval: t.requires_approval,
      },
    });
  };
  const mutate = async (
    action: string,
    id: string,
    data: Record<string, unknown> = {},
  ) => {
    if (!user) throw new Error("Přihlaste se znovu.");
    if (!navigator.onLine)
      throw new Error(
        "Jste offline. Připojte se k internetu a zkuste to znovu.",
      );
    if (
      (action === "create" || action === "edit" || action === "organize") &&
      data.placement
    ) {
      const response = await fetch("/api/task-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_task",
          save_action: action,
          task_id: id,
          placement: data.placement,
          draft: data,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      acceptBoard(result);
    } else {
      const response = await fetch("/api/task-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (
        action === "transition" &&
        data.status === "DONE" &&
        data.expected_status !== "DONE"
      )
        setCelebration(Date.now());
    }
    await refresh();
  };
  const logout = () => {
    clearSession();
    router.push("/login");
  };
  const activeFor = (name: string) =>
    tasks.filter(
      (t) =>
        !t.archived_at &&
        t.task_assignments.some(
          (a) => a.assignee === name && a.status !== "DONE",
        ),
    );
  if (!user)
    return <div className={s.loading}>Připravuji váš pracovní prostor…</div>;
  const owner = user.role === "OWNER",
    selected = tasks.find((t) => t.id === selectedId),
    title =
      scope === "ME"
        ? "Moje úkoly"
        : scope === "TEAM"
          ? "Týmový přehled"
          : scope === "CREATED"
            ? "Zadané mnou"
            : `Úkoly · ${scope}`;
  return (
    <div className={s.workspace}>
      <aside className={s.sidebar} aria-label="Pracovní prostor">
        <div className={s.brand}>
          <LimmitLogo height={34} variant="light" />
        </div>
        <div className={s.sideSection}>
          <span className={s.sideLabel}>PRACOVNÍ PROSTOR</span>
          <button
            className={`${s.sideButton} ${scope === "ME" ? s.sideActive : ""}`}
            onClick={() => switchScope("ME")}
          >
            <Icon name="grid" />
            Moje úkoly<em>{activeFor(user.displayName).length}</em>
          </button>
          {owner && (
            <button
              className={`${s.sideButton} ${scope === "TEAM" ? s.sideActive : ""}`}
              onClick={() => switchScope("TEAM")}
            >
              <Icon name="team" />
              Celý tým
            </button>
          )}
          <button
            className={`${s.sideButton} ${scope === "CREATED" ? s.sideActive : ""}`}
            onClick={() => switchScope("CREATED")}
          >
            <Icon name="list" />
            Zadané mnou
          </button>
          <button className={s.sideButton} onClick={() => setFilter("today")}>
            <Icon name="calendar" />
            Dnešní plán
          </button>
          <button className={s.sideButton} onClick={() => setFilter("done")}>
            <Icon name="check" />
            Hotovo / Archiv
          </button>
        </div>
        {owner && (
          <div className={s.sideSection}>
            <span className={s.sideLabel}>LIDÉ V TÝMU</span>
            {USERS.map((u) => (
              <button
                key={u.username}
                className={`${s.sideButton} ${scope === u.displayName ? s.sideActive : ""}`}
                onClick={() => switchScope(u.displayName)}
              >
                <Avatar name={u.displayName} />
                {u.displayName}
                <em>{activeFor(u.displayName).length}</em>
              </button>
            ))}
          </div>
        )}
        <InstallApp />
        <div className={s.sideFooter}>
          <Avatar name={user.displayName} />
          <div>
            <strong>{user.displayName}</strong>
            <small>{owner ? "Majitel / správce týmu" : "Člen týmu"}</small>
          </div>
          <button aria-label="Odhlásit se" onClick={logout}>
            ↪
          </button>
        </div>
      </aside>
      <main className={s.main}>
        <PushNotifications compact />
        <header className={`${s.topline} ${s.withAvailability}`}>
          <div>
            <span className={s.eyebrow}>
              {new Date().toLocaleDateString("cs-CZ", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              / VÁŠ PRACOVNÍ DEN
            </span>
            <h1 className={s.heading}>
              {board?.projects?.find((p) => p.id === projectId)?.title || title}
            </h1>
            <p className={s.subtitle}>
              {scope === "ME"
                ? `Ahoj, ${user.displayName}. Vše důležité na jednom místě.`
                : scope === "TEAM"
                  ? "Společný směr. Jasné priority. Přehled o každém úkolu."
                  : "Kompletní přehled práce, termínů a postupu zaměstnance."}
            </p>
          </div>
          <div className={s.topActions}>
            <button
              className={s.secondary}
              onClick={() => void refresh()}
              aria-label="Obnovit úkoly"
            >
              ↻ Obnovit
            </button>
            <button className={s.primary} onClick={() => newTask()}>
              <Icon name="plus" />
              Nový úkol
            </button>
          </div>
          <TeamAvailability />
        </header>
        {board && (
          <ProjectPicker
            board={board}
            username={user.username}
            tasks={tasks.filter(
              (t) =>
                user.role === "OWNER" ||
                t.created_by === user.displayName ||
                t.task_assignments.some((a) => a.assignee === user.displayName),
            )}
            disabled={!!editor}
            onSelect={switchProject}
            onSaved={acceptBoard}
          />
        )}
        <TaskInbox
          tasks={tasks}
          user={user}
          board={board}
          open={inboxOpen}
          onOpen={() => setInboxOpen(true)}
          onClose={() => setInboxOpen(false)}
          onRefresh={refresh}
        />
        <div className={s.mobileScope}>
          {
            <select
              className={s.select}
              aria-label="Pracovní pohled"
              value={scope}
              onChange={(e) => switchScope(e.target.value)}
            >
              <option value="ME">Moje úkoly</option>
              <option value="CREATED">Zadané mnou</option>
              {owner && <option value="TEAM">Celý tým</option>}
              {owner &&
                USERS.map((u) => (
                  <option key={u.username} value={u.displayName}>
                    Zaměstnanec: {u.displayName}
                  </option>
                ))}
            </select>
          }
          <button
            className={s.secondary}
            aria-label="Odhlásit se"
            onClick={logout}
          >
            ↪
          </button>
          <InstallApp compact />
        </div>
        {(!online || error) && (
          <div className={s.notice} role="alert">
            <span>
              {!online
                ? "Jste offline. Přehled může být starší. Pro uložení změn se připojte k internetu."
                : error}
            </span>
            <button onClick={() => void refresh()}>Zkusit znovu</button>
          </div>
        )}
        {USERS.some((u) => u.displayName === scope) && (
          <div className={s.personBanner}>
            <Avatar name={scope} large />
            <div>
              <h2>{scope}</h2>
              <p>
                {USERS.find((u) => u.displayName === scope)?.role === "OWNER"
                  ? "Majitel"
                  : "Člen týmu"}{" "}
                · Osobní pracovní přehled
              </p>
            </div>
            <button className={s.secondary} onClick={() => switchScope("TEAM")}>
              ← Zpět na tým
            </button>
          </div>
        )}
        <section className={s.stats} aria-label="Souhrn úkolů">
          {(
            [
              {
                key: "active",
                label: "Otevřené úkoly",
                hint: "čekají na další krok",
                cls: s.statAccent,
              },
              {
                key: "today",
                label: "Na dnešek",
                hint: "termíny a připomenutí",
                cls: "",
              },
              {
                key: "overdue",
                label: "Po termínu",
                hint: "potřebují pozornost",
                cls: s.statWarning,
              },
              {
                key: "review",
                label: "Ke schválení",
                hint: "čekají na kontrolu",
                cls: "",
              },
            ] as const
          ).map((stat) => (
            <button
              key={stat.key}
              className={`${s.stat} ${stat.cls}`}
              aria-pressed={filter === stat.key}
              onClick={() => setFilter(stat.key)}
            >
              <span>{stat.label}</span>
              <strong>{loading ? "—" : counts[stat.key]}</strong>
              <small>{stat.hint}</small>
            </button>
          ))}
        </section>
        {scope === "TEAM" && (
          <section aria-label="Zaměstnanci">
            <div className={s.sectionTitle}>
              <h2>Lidé a jejich práce</h2>
              <small>Kliknutím otevřete celý náhled</small>
            </div>
            <div className={s.people}>
              {USERS.map((u) => {
                const mine = activeFor(u.displayName),
                  lateCount = mine.filter((t) => overdue(t)).length;
                return (
                  <button
                    key={u.username}
                    className={s.person}
                    onClick={() => switchScope(u.displayName)}
                  >
                    <div className={s.personHeader}>
                      <Avatar name={u.displayName} />
                      <div>
                        <strong>{u.displayName}</strong>
                        <small>
                          {u.role === "OWNER" ? "Majitel" : "Člen týmu"}
                        </small>
                      </div>
                      <span style={{ marginLeft: "auto", color: "#91a38f" }}>
                        ↗
                      </span>
                    </div>
                    <div className={s.personNumbers}>
                      <span>
                        <b>{mine.length}</b>aktivních
                      </span>
                      <span className={lateCount ? s.late : ""}>
                        <b>{lateCount}</b>po termínu
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <div className={s.tabs} role="tablist" aria-label="Kategorie úkolů">
          {TABS.map((tab) => (
            <button
              role="tab"
              aria-selected={filter === tab.key}
              key={tab.key}
              className={`${s.tab} ${filter === tab.key ? s.tabActive : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span>{counts[tab.key]}</span>
            </button>
          ))}
        </div>
        <div className={s.toolbar}>
          <div className={s.search}>
            <Icon name="search" />
            <input
              aria-label="Hledat úkoly"
              placeholder="Hledat úkol nebo člověka…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`${s.secondary} ${s.filterButton}`}
            aria-expanded={filtersOpen}
            aria-controls="task-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Filtry
            {statusFilter !== "all" || priorityFilter !== "all"
              ? ` · ${Number(statusFilter !== "all") + Number(priorityFilter !== "all")}`
              : ""}
            <span aria-hidden>{filtersOpen ? "−" : "+"}</span>
          </button>
          <div
            id="task-filters"
            className={s.filterControls}
            data-open={filtersOpen}
          >
            <select
              className={s.select}
              aria-label="Filtrovat podle stavu"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Všechny stavy</option>
              {Object.entries(STATUS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className={s.select}
              aria-label="Filtrovat podle priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">Priorita</option>
              {Object.entries(PRIORITY).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {(statusFilter !== "all" || priorityFilter !== "all") && (
              <button
                className={s.quiet}
                onClick={() => {
                  setStatusFilter("all");
                  setPriorityFilter("all");
                }}
              >
                Zrušit filtry
              </button>
            )}
          </div>
          <select
            className={`${s.select} ${s.sortSelect}`}
            aria-label="Řazení úkolů"
            aria-describedby={
              view === "calendar" ? "calendar-sort-hint" : undefined
            }
            title={
              view === "calendar"
                ? "Řazení úkolů v jednotlivých dnech a bez termínu"
                : "Řazení úkolů v tomto zobrazení"
            }
            value={sort}
            onChange={(e) => changeSort(e.target.value as TaskSort)}
          >
            {Object.entries(TASK_SORT_LABELS)
              .filter(([key]) => key !== "manual" || view === "board")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
          <div className={s.viewToggle}>
            {(["board", "list", "calendar"] as const).map((v) => (
              <button
                key={v}
                aria-label={
                  v === "board"
                    ? "Nástěnka"
                    : v === "calendar"
                      ? "Kalendář"
                      : "Seznam"
                }
                aria-pressed={view === v}
                className={view === v ? s.selected : ""}
                onClick={() => {
                  setView(v);
                  try {
                    localStorage.setItem("limmit:task-view", v);
                  } catch {}
                }}
              >
                <Icon
                  name={
                    v === "board"
                      ? "grid"
                      : v === "calendar"
                        ? "calendar"
                        : "list"
                  }
                  size={15}
                />
                <span>
                  {v === "board"
                    ? "Nástěnka"
                    : v === "calendar"
                      ? "Kalendář"
                      : "Seznam"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className={s.loading}>Načítám úkoly…</div>
        ) : view === "board" ? (
          <>
            {boardError && (
              <div className={s.formError} role="alert">
                {boardError}{" "}
                {boardError.includes("přihl") && (
                  <a href="/login">Přihlásit se</a>
                )}
              </div>
            )}
            {board && (
              <TaskBoard
                key={projectId || "all"}
                board={board}
                tasks={filtered}
                manualOrder={sort === "manual"}
                user={user}
                onBoard={acceptBoard}
                onRefresh={refresh}
                onNew={newTask}
                renderCard={(t) => (
                  <TaskCard
                    task={t}
                    projects={taskProjects(t.id)}
                    person={person}
                    onOpen={() => setSelectedId(t.id)}
                  />
                )}
              />
            )}
          </>
        ) : view === "calendar" ? (
          <>
            <p id="calendar-sort-hint" className={s.sortHint}>
              Řazení platí pro úkoly uvnitř jednotlivých dnů a pro úkoly bez
              termínu.
            </p>
            <TaskCalendar
              tasks={filtered}
              taskProjects={taskProjects}
              onOpen={setSelectedId}
              onNew={(date) => newTask(undefined, date)}
            />
          </>
        ) : !filtered.length ? (
          <div className={s.empty}>
            <Icon name="check" size={32} />
            <h3>
              {error
                ? "Přehled zatím není dostupný"
                : filter === "overdue"
                  ? "Žádné úkoly po termínu"
                  : query
                    ? "Nic jsme nenašli"
                    : "Tady je zatím volno"}
            </h3>
            <p>
              {query
                ? "Zkuste jiný název nebo upravte filtry."
                : "Přidejte nový úkol nebo se podívejte do jiné kategorie."}
            </p>
            <button className={s.primary} onClick={() => newTask()}>
              <Icon name="plus" />
              Přidat úkol
            </button>
          </div>
        ) : (
          <div className={s.list}>
            {filtered.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                projects={taskProjects(t.id)}
                person={person}
                onOpen={() => setSelectedId(t.id)}
              />
            ))}
          </div>
        )}
        <footer className={s.bottomNote}>
          <span>
            {filtered.length} úkolů v tomto pohledu ·{" "}
            {online ? "Průběžně synchronizováno" : "Offline"}
          </span>
          <span>Malé kroky. Společné výsledky.</span>
        </footer>
      </main>
      {!!celebration && (
        <CompletionCelebration key={celebration} onEnd={endCelebration} />
      )}
      {toast && (
        <div className={s.toast} role="status">
          {toast}
        </div>
      )}
      {selected && !editor && !handoff && (
        <TaskDetail
          key={selected.id}
          task={selected}
          user={user}
          mutate={mutate}
          onClose={() => setSelectedId(null)}
          onEdit={() => editTask(selected)}
          onHandoff={() => setHandoff(true)}
          onNotice={setToast}
          onAccept={
            inInbox(selected, user)
              ? () => {
                  setSelectedId(null);
                  setInboxOpen(true);
                }
              : undefined
          }
        />
      )}
      {selected && handoff && (
        <TaskHandoff
          task={selected}
          user={user}
          mutate={mutate}
          onClose={() => setHandoff(false)}
          onSaved={(name) => {
            setHandoff(false);
            setToast(`Nový řešitel: ${name}. Předání je uložené.`);
          }}
        />
      )}
      {editor && (
        <TaskEditor
          projects={board?.projects}
          canEditContent={
            editor.isNew ||
            !!tasks.find((t) => t.id === editor.draft.id && canManage(t, user))
          }
          canEditPlacement={
            editor.isNew ||
            !!tasks.find(
              (t) => t.id === editor.draft.id && canOrganize(t, user),
            )
          }
          key={editor.draft.id}
          initial={editor.draft}
          isNew={editor.isNew}
          user={user}
          mutate={mutate}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setToast(
              editor.isNew ? "Úkol byl vytvořen." : "Změny jsou uložené.",
            );
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  projects = [],
  person,
  onOpen,
}: {
  task: Task;
  projects?: NonNullable<BoardSnapshot["projects"]>;
  person?: string;
  onOpen: () => void;
}) {
  const status = statusFor(task, person),
    done = task.task_assignments.filter((a) => a.status === "DONE").length;
  return (
    <button
      className={s.card}
      onClick={onOpen}
      aria-label={`Otevřít úkol: ${task.title}`}
    >
      <div className={s.cardTop}>
        <span className={s.priority} data-priority={task.priority}>
          <i className={s.dot} />
          {PRIORITY[task.priority]}
        </span>
        <span style={{ color: "#a5b19f", fontSize: 14 }}>↗</span>
      </div>
      <div>
        <strong className={s.cardTitle}>{task.title}</strong>
        {task.description?.split("Původní úkol v Asaně:")[0].trim() && (
          <p className={s.cardDescription}>
            {task.description.split("Původní úkol v Asaně:")[0].trim()}
          </p>
        )}
        <ProjectLabels projects={projects} />
      </div>
      <div className={s.cardMeta}>
        <Badge status={status} />
        <span
          className={`${s.date} ${overdue(task) && status !== "DONE" ? s.late : ""}`}
        >
          <Icon name="calendar" size={12} />
          {task.due === todayISO() ? "Dnes" : dateLabel(task.due)}
        </span>
      </div>
      <div className={s.cardFooter}>
        <div className={s.avatars}>
          {task.task_assignments.slice(0, 5).map((a) => (
            <Avatar key={a.assignee} name={a.assignee} />
          ))}
        </div>
        <span className={s.cardAssignees}>
          {task.task_assignments.map((a) => a.assignee).join(", ") ||
            "Bez řešitele"}
        </span>
        <small>
          {task.task_assignments.length > 1
            ? `${done}/${task.task_assignments.length} hotovo`
            : task.requires_approval
              ? "S kontrolou"
              : "Bez schvalování"}
        </small>
      </div>
      {task.task_assignments.length > 1 && (
        <div
          className={s.progress}
          aria-label={`Dokončeno ${done} z ${task.task_assignments.length}`}
        >
          <i
            style={{ width: `${(done / task.task_assignments.length) * 100}%` }}
          />
        </div>
      )}
    </button>
  );
}
