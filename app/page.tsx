"use client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ===== Typy ===== */
type Priority = "Low" | "Medium" | "High" | "Urgent";
type Status =
  | "PENDING_ACCEPT"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "SUBMITTED_DONE"
  | "ARCHIVED"
  | "DECLINED"
  | "RETURNED";
type Role = "OWNER" | "EMPLOYEE";

type Task = {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  priority: Priority;
  due?: string; // YYYY-MM-DD
  status: Status;
  lane?: string;

  accepted_at?: string | null;
  completed_at?: string | null;
  owner_verified_at?: string | null;
  completion_note?: string | null;
  owner_review_note?: string | null;

  created_at?: string;
  updated_at?: string;
};

/** ===== Konfigurace UI ===== */
const EMPLOYEES = ["Miloš", "Vendy", "Niki", "Karča", "Viki", "Kačka"] as const;

const PRIORITY_STYLE: Record<Priority, { label: string; cls: string }> = {
  Low: { label: "Nízká", cls: "bg-green-500" },
  Medium: { label: "Střední", cls: "bg-yellow-500" },
  High: { label: "Vysoká", cls: "bg-orange-500" },
  Urgent: { label: "Naléhavá", cls: "bg-red-600" },
};
const STATUS_CZ: Record<Status, string> = {
  PENDING_ACCEPT: "Čeká na přijetí",
  ACCEPTED: "Přijato",
  IN_PROGRESS: "Rozpracováno",
  SUBMITTED_DONE: "Odevzdáno – čeká na schválení",
  ARCHIVED: "Archivováno",
  DECLINED: "Odmítnuto",
  RETURNED: "Vráceno k dopracování",
};
const STATUS_STYLE: Record<Status, { badge: string; ring: string }> = {
  PENDING_ACCEPT: { badge: "bg-zinc-500", ring: "ring-1 ring-zinc-500/50" },
  ACCEPTED: { badge: "bg-blue-600", ring: "ring-1 ring-blue-600/40" },
  IN_PROGRESS: { badge: "bg-indigo-600", ring: "ring-1 ring-indigo-600/40" },
  SUBMITTED_DONE: { badge: "bg-amber-600", ring: "ring-2 ring-amber-500/60" },
  ARCHIVED: { badge: "bg-emerald-700", ring: "ring-1 ring-emerald-700/40" },
  DECLINED: { badge: "bg-zinc-700", ring: "ring-1 ring-zinc-700/50" },
  RETURNED: { badge: "bg-orange-600", ring: "ring-2 ring-orange-600/60" },
};

const prettyDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "Bez termínu");

/** ===== Lanes (osobní sloupce) – dočasně lokálně, dokud nepřidáme přihlášení ===== */
const LS_LANES = "firemni-ukoly:lanes";
const DEFAULT_LANES = ["Nové", "Dnes", "Rozpracované", "Později"];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [role, setRole] = useState<Role>("OWNER");
  const [who, setWho] = useState<string>(EMPLOYEES[0]);
  const [lanes, setLanes] = useState<Record<string, string[]>>({});
  const [ownerView, setOwnerView] = useState<"ALL" | "REVIEW">("ALL");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const lanesFor = (emp: string) => lanes[emp] ?? DEFAULT_LANES;

  /** --- Načtení lanes z localStorage (jen preference UI) --- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LANES);
      if (raw) setLanes(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_LANES, JSON.stringify(lanes));
    } catch {}
  }, [lanes]);

  /** --- 1) Načtení úkolů ze Supabase --- */
  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Supabase SELECT error:", error);
      return;
    }
    setTasks(
      (data ?? []).map((t: any) => ({
        ...t,
        priority: (t.priority || "Low") as Priority,
        status: (t.status || "PENDING_ACCEPT") as Status,
      }))
    );
  };

  /** --- 2) Realtime odběr změn --- */
  useEffect(() => {
    fetchTasks(); // první načtení

    const channel = supabase
      .channel("tasks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          // jednoduchá synchronizace do state
          if (payload.eventType === "INSERT") {
            setTasks((prev) => [payload.new as Task, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Task;
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as Task;
            setTasks((prev) => prev.filter((t) => t.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /** --- CRUD operace přes Supabase --- */
  const addTask = async (partial: Omit<Task, "id" | "status">) => {
    const lane = partial.lane || lanesFor(partial.assignee || EMPLOYEES[0])[0];
    const insertObj = {
      title: partial.title,
      description: partial.description ?? null,
      assignee: partial.assignee ?? null,
      priority: partial.priority,
      due: partial.due || null,
      status: "PENDING_ACCEPT" as Status,
      lane,
    };
    const { error } = await supabase.from("tasks").insert(insertObj);
    if (error) alert("Chyba při vytváření úkolu: " + error.message);
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) alert("Chyba při ukládání: " + error.message);
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) alert("Chyba při mazání: " + error.message);
  };

  /** --- UI seskupení --- */
  const ownerColumns = useMemo(() => {
    const order = EMPLOYEES.slice();
    const map: Record<string, Task[]> = Object.fromEntries(order.map((e) => [e, [] as Task[]]));
    for (const t of tasks) map[t.assignee || ""]?.push(t);
    return { order, map };
  }, [tasks]);

  const ownerReviewColumns = useMemo(() => {
    const order = EMPLOYEES.slice();
    const map: Record<string, Task[]> = Object.fromEntries(order.map((e) => [e, [] as Task[]]));
    for (const t of tasks)
      if (t.status === "SUBMITTED_DONE") map[t.assignee || ""]?.push(t);
    return { order, map };
  }, [tasks]);

  const employeeColumns = useMemo(() => {
    const order = lanesFor(who);
    const map: Record<string, Task[]> = Object.fromEntries(order.map((l) => [l, [] as Task[]]));
    for (const t of tasks)
      if (t.assignee === who) map[t.lane ?? order[0]]?.push(t);
    return { order, map };
  }, [tasks, who, lanes]);

  /** --- Lanes správa (lokální preference) --- */
  const addLane = () => {
    const name = prompt("Název nového sloupce:");
    if (!name) return;
    setLanes((prev) => {
      const list = lanesFor(who);
      if (list.includes(name)) return prev;
      return { ...prev, [who]: [...list, name] };
    });
  };
  const renameLane = (oldName: string) => {
    const name = prompt("Přejmenovat sloupec na:", oldName);
    if (!name || name === oldName) return;
    setLanes((prev) => {
      const list = lanesFor(who).map((l) => (l === oldName ? name : l));
      setTasks((p) => p.map((t) => (t.assignee === who && t.lane === oldName ? { ...t, lane: name } : t)));
      return { ...prev, [who]: list };
    });
  };
  const removeLane = (name: string) => {
    const list = lanesFor(who);
    if (list.length <= 1) return alert("Musí zůstat alespoň jeden sloupec.");
    if (!confirm(`Smazat sloupec „${name}“? Úkoly přesuneme do prvního.`)) return;
    const first = list[0];
    setLanes((prev) => {
      const next = list.filter((l) => l !== name);
      setTasks((p) => p.map((t) => (t.assignee === who && t.lane === name ? { ...t, lane: first } : t)));
      return { ...prev, [who]: next };
    });
  };

  /** --- Modal otevřít/uložit --- */
  const openNew = (assignee?: string, lane?: string) => {
    setEditing({
      id: "",
      title: "",
      assignee: assignee || (role === "EMPLOYEE" ? who : EMPLOYEES[0]),
      priority: "Low",
      due: "",
      description: "",
      status: "PENDING_ACCEPT",
      lane: lane || lanesFor(assignee || (role === "EMPLOYEE" ? who : EMPLOYEES[0]))[0],
    });
    setModalOpen(true);
  };
  const openEdit = (t: Task) => { setEditing({ ...t }); setModalOpen(true); };

  const submitForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const payload: Partial<Task> = {
      title: String(f.get("title") || "").trim(),
      assignee: String(f.get("assignee") || ""),
      priority: String(f.get("priority") || "Low") as Priority,
      due: String(f.get("due") || "") || null as any,
      description: String(f.get("description") || "") || null as any,
      lane: String(f.get("lane") || "") || null as any,
    };
    if (!payload.title) return alert("Název je povinný.");
    if (editing.id) await updateTask(editing.id, payload);
    else await addTask(payload as any);
    setModalOpen(false);
    setEditing(null);
  };

  /** --- Workflow akce --- */
  const nowIso = () => new Date().toISOString();
  const can = {
    accept: (t: Task) => role === "EMPLOYEE" && t.assignee === who && t.status === "PENDING_ACCEPT",
    decline: (t: Task) => role === "EMPLOYEE" && t.assignee === who && t.status === "PENDING_ACCEPT",
    inProgress: (t: Task) =>
      role === "EMPLOYEE" && t.assignee === who && (t.status === "ACCEPTED" || t.status === "RETURNED"),
    submitDone: (t: Task) =>
      role === "EMPLOYEE" && t.assignee === who && ["ACCEPTED", "IN_PROGRESS", "RETURNED"].includes(t.status),
    approveArchive: (t: Task) => role === "OWNER" && t.status === "SUBMITTED_DONE",
    returnTask: (t: Task) => role === "OWNER" && t.status === "SUBMITTED_DONE",
    edit: (_t: Task) => true,
    remove: (_t: Task) => role === "OWNER",
  };

  const doAccept         = (t: Task) => updateTask(t.id, { status: "ACCEPTED", accepted_at: nowIso() });
  const doDecline        = (t: Task) => updateTask(t.id, { status: "DECLINED" });
  const doInProgress     = (t: Task) => updateTask(t.id, { status: "IN_PROGRESS" });
  const doSubmitDone     = (t: Task) => {
    const note = prompt("Poznámka k dokončení (volitelné):", t.completion_note || "");
    updateTask(t.id, { status: "SUBMITTED_DONE", completed_at: nowIso(), completion_note: note || "" });
  };
  const doApproveArchive = (t: Task) => {
    const note = prompt("Poznámka (volitelné):", t.owner_review_note || "");
    updateTask(t.id, { status: "ARCHIVED", owner_verified_at: nowIso(), owner_review_note: note || "" });
  };
  const doReturn         = (t: Task) => {
    const note = prompt("Důvod vrácení (povinné):", "");
    if (!note) return;
    updateTask(t.id, { status: "RETURNED", owner_review_note: note });
  };

  /** --- Drag & drop (zaměstnanec) --- */
  const onDragStart = (e: React.DragEvent, id: string) => e.dataTransfer.setData("text/plain", id);
  const onDropToLane = (e: React.DragEvent, laneName: string) => {
    const id = e.dataTransfer.getData("text/plain");
    const t = tasks.find((x) => x.id === id);
    if (id && t && t.assignee === who) updateTask(id, { lane: laneName });
  };

  /** --- UI --- */
  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Přehled úkolů</h1>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Role:</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md bg-zinc-800 px-3 py-2 outline-none">
              <option value="OWNER">Majitel</option>
              <option value="EMPLOYEE">Zaměstnanec</option>
            </select>
          </div>

          {role === "EMPLOYEE" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Jsem:</span>
                <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-md bg-zinc-800 px-3 py-2 outline-none">
                  {EMPLOYEES.map((e) => (<option key={e} value={e}>{e}</option>))}
                </select>
              </div>
              <button onClick={() => openNew(who)} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm">
                + Nový úkol
              </button>
              <button onClick={addLane} className="bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg text-sm">
                + Přidat sloupec
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Pohled:</span>
                <div className="inline-flex rounded-lg overflow-hidden">
                  <button className={`px-3 py-2 text-sm ${ownerView === "ALL" ? "bg-zinc-700" : "bg-zinc-800"}`} onClick={() => setOwnerView("ALL")}>
                    Vše
                  </button>
                  <button className={`px-3 py-2 text-sm ${ownerView === "REVIEW" ? "bg-zinc-700" : "bg-zinc-800"}`} onClick={() => setOwnerView("REVIEW")}>
                    Ke schválení
                  </button>
                </div>
              </div>
              <button onClick={() => openNew()} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm">
                + Nový úkol
              </button>
            </>
          )}
        </div>
      </header>

      {role === "OWNER" ? (
        <div className="flex gap-6 overflow-x-auto pb-4">
          {(ownerView === "ALL" ? ownerColumns.order : ownerReviewColumns.order).map((emp) => {
            const list = (ownerView === "ALL" ? ownerColumns.map : ownerReviewColumns.map)[emp] || [];
            return (
              <Column key={emp} title={emp} count={list.length} onAdd={() => openNew(emp)}>
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={() => openEdit(task)}
                    onDelete={() => { if (confirm("Smazat úkol?")) deleteTask(task.id); }}
                    actionsOwner={{
                      approve: can.approveArchive(task) ? () => doApproveArchive(task) : undefined,
                      returnBack: can.returnTask(task) ? () => doReturn(task) : undefined,
                    }}
                  />
                ))}
              </Column>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-4">
          {employeeColumns.order.map((laneName) => {
            const list = employeeColumns.map[laneName] || [];
            return (
              <Column
                key={laneName}
                title={laneName}
                count={list.length}
                onAdd={() => openNew(who, laneName)}
                onRename={() => renameLane(laneName)}
                onRemove={() => removeLane(laneName)}
                droppable
                onDrop={(e) => onDropToLane(e, laneName)}
              >
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    onEdit={() => openEdit(task)}
                    onDelete={() => { if (confirm("Smazat úkol?")) deleteTask(task.id); }}
                    actionsEmployee={{
                      accept: can.accept(task) ? () => doAccept(task) : undefined,
                      decline: can.decline(task) ? () => doDecline(task) : undefined,
                      inProgress: can.inProgress(task) ? () => doInProgress(task) : undefined,
                      submitDone: can.submitDone(task) ? () => doSubmitDone(task) : undefined,
                    }}
                  />
                ))}
              </Column>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-800 p-6 rounded-xl w-[95%] max-w-lg relative">
            <button onClick={() => { setModalOpen(false); setEditing(null); }} className="absolute top-3 right-4 text-gray-400 hover:text-white">✕</button>
            <h2 className="text-2xl font-semibold mb-4">{editing.id ? "Upravit úkol" : "Nový úkol"}</h2>

            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Název</label>
                <input name="title" defaultValue={editing.title} className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm mb-1">Zaměstnanec</label>
                  <select
                    name="assignee"
                    defaultValue={editing.assignee}
                    className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                    onChange={(e) => {
                      const emp = e.target.value;
                      setEditing((prev) => prev ? { ...prev, assignee: emp, lane: lanesFor(emp)[0] } : prev);
                    }}
                  >
                    {EMPLOYEES.map((e) => (<option key={e} value={e}>{e}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Priorita</label>
                  <select name="priority" defaultValue={editing.priority} className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none">
                    <option value="Low">Nízká</option>
                    <option value="Medium">Střední</option>
                    <option value="High">Vysoká</option>
                    <option value="Urgent">Naléhavá</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Termín</label>
                  <input type="date" name="due" defaultValue={editing.due || ""} className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1">Zařazení (můj sloupec)</label>
                <select name="lane" value={editing.lane || lanesFor(editing.assignee || who)[0]} onChange={(e) => setEditing((p) => p ? { ...p, lane: e.target.value } : p)} className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none">
                  {lanesFor(editing.assignee || who).map((l) => (<option key={l} value={l}>{l}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Popis</label>
                <textarea name="description" defaultValue={editing.description} rows={4} className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none" />
              </div>

              <div className="flex justify-between items-center">
                {editing.id ? (
                  <button type="button" className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm"
                    onClick={() => { if (confirm("Opravdu smazat tento úkol?")) { deleteTask(editing.id); setModalOpen(false); setEditing(null); } }}>
                    Smazat
                  </button>
                ) : <span />}

                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm">Uložit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/** ===== Pomocné prezent. komponenty ===== */
function Column({
  title, count, children, onAdd, onRename, onRemove, droppable, onDrop,
}: {
  title: string; count: number; children: React.ReactNode;
  onAdd?: () => void; onRename?: () => void; onRemove?: () => void;
  droppable?: boolean; onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="bg-zinc-800 rounded-xl p-4 w-80 flex-shrink-0"
      onDragOver={droppable ? (e) => e.preventDefault() : undefined}
      onDrop={droppable ? onDrop : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {title} <span className="text-gray-400 text-sm">({count})</span>
        </h2>
        <div className="flex gap-2">
          {onAdd && <button className="text-sm text-gray-300 hover:text-white" onClick={onAdd}>+ Úkol</button>}
          {onRename && <button className="text-xs text-gray-400 hover:text-white" onClick={onRename}>Přejmenovat</button>}
          {onRemove && <button className="text-xs text-red-400 hover:text-red-300" onClick={onRemove}>Smazat</button>}
        </div>
      </div>
      <div className="flex flex-col gap-3 min-h-24">{children}</div>
    </div>
  );
}

function TaskCard({
  task, onEdit, onDelete, draggable, onDragStart, actionsOwner, actionsEmployee,
}: {
  task: Task; onEdit: () => void; onDelete: () => void;
  draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
  actionsOwner?: { approve?: () => void; returnBack?: () => void };
  actionsEmployee?: { accept?: () => void; decline?: () => void; inProgress?: () => void; submitDone?: () => void };
}) {
  const p = PRIORITY_STYLE[task.priority];
  const st = STATUS_STYLE[task.status];
  return (
    <div className={`bg-zinc-700 rounded-lg p-3 hover:bg-zinc-600 transition ${st.ring}`} draggable={draggable} onDragStart={onDragStart} title={task.description || ""}>
      <div className="flex justify-between items-start">
        <button onClick={onEdit} className="text-left font-medium leading-tight hover:underline">{task.title}</button>
        <span className={`text-xs px-2 py-0.5 rounded-full ${p.cls}`}>{p.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
        <span className={`px-2 py-0.5 rounded-full ${st.badge}`}>{STATUS_CZ[task.status]}</span>
        <span className="text-gray-300">{prettyDate(task.due)}</span>
        {task.lane && <span className="px-2 py-0.5 rounded-full bg-zinc-600">Sloupec: {task.lane}</span>}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {actionsEmployee?.accept && <button className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded" onClick={actionsEmployee.accept}>Přijmout</button>}
        {actionsEmployee?.decline && <button className="text-xs bg-zinc-600 hover:bg-zinc-700 px-2 py-0.5 rounded" onClick={actionsEmployee.decline}>Odmítnout</button>}
        {actionsEmployee?.inProgress && <button className="text-xs bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded" onClick={actionsEmployee.inProgress}>Rozpracováno</button>}
        {actionsEmployee?.submitDone && <button className="text-xs bg-green-600 hover:bg-green-700 px-2 py-0.5 rounded" onClick={actionsEmployee.submitDone}>Odevzdat „Hotovo“</button>}

        {actionsOwner?.approve && <button className="text-xs bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded" onClick={actionsOwner.approve}>Schválit & Archivovat</button>}
        {actionsOwner?.returnBack && <button className="text-xs bg-orange-600 hover:bg-orange-700 px-2 py-0.5 rounded" onClick={actionsOwner.returnBack}>Vrátit k dopracování</button>}

        <button className="text-xs bg-zinc-600 hover:bg-zinc-700 px-2 py-0.5 rounded" onClick={onEdit}>Upravit</button>
        <button className="text-xs bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded" onClick={onDelete}>Smazat</button>
      </div>
    </div>
  );
}
