"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ===== Typy ===== */
type Priority = "Low" | "Medium" | "High" | "Urgent"; // interně EN, zobrazujeme CZ
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
  assignee: string;
  priority: Priority;
  due?: string;
  description?: string;

  status: Status;

  acceptedAt?: string;
  completedAt?: string;
  ownerVerifiedAt?: string;

  completionNote?: string;
  ownerReviewNote?: string;

  // osobní zařazení zaměstnance (sloupec/„lane“)
  lane?: string;

  createdAt: string;
  updatedAt: string;
};

/** ===== Zaměstnanci ===== */
const EMPLOYEES = ["Miloš", "Vendy", "Niki", "Karča", "Viki", "Kačka"] as const;

/** ===== Překlady / vzhled ===== */
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
// výraznější štítky + obrys karty podle stavu
const STATUS_STYLE: Record<
  Status,
  { badge: string; cardRing: string }
> = {
  PENDING_ACCEPT: { badge: "bg-zinc-500", cardRing: "ring-1 ring-zinc-500/50" },
  ACCEPTED: { badge: "bg-blue-600", cardRing: "ring-1 ring-blue-600/40" },
  IN_PROGRESS: { badge: "bg-indigo-600", cardRing: "ring-1 ring-indigo-600/40" },
  SUBMITTED_DONE: { badge: "bg-amber-600", cardRing: "ring-2 ring-amber-500/60" },
  ARCHIVED: { badge: "bg-emerald-700", cardRing: "ring-1 ring-emerald-700/40" },
  DECLINED: { badge: "bg-zinc-700", cardRing: "ring-1 ring-zinc-700/50" },
  RETURNED: { badge: "bg-orange-600", cardRing: "ring-2 ring-orange-600/60" },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const prettyDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "Bez termínu");

/** ===== LocalStorage klíče ===== */
const LS_TASKS = "firemni-ukoly:tasks";
const LS_WHO = "firemni-ukoly:who";
const LS_LANES = "firemni-ukoly:lanes"; // { [employee]: string[] }

/** ===== Výchozí osobní sloupce zaměstnance ===== */
const DEFAULT_LANES = ["Nové", "Dnes", "Rozpracované", "Později"];

/** ===== Komponenta ===== */
export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [role, setRole] = useState<Role>("OWNER");
  const [who, setWho] = useState<string>(EMPLOYEES[0]);

  // osobní sloupce každého zaměstnance
  const [lanes, setLanes] = useState<Record<string, string[]>>({});
  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  // režim majitele: "vše" nebo "ke schválení"
  const [ownerView, setOwnerView] = useState<"ALL" | "REVIEW">("ALL");

  /** Načtení z LS */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TASKS);
      if (raw) setTasks(JSON.parse(raw));
      const whoRaw = localStorage.getItem(LS_WHO);
      if (whoRaw) {
        const p = JSON.parse(whoRaw) as { role: Role; who: string; ownerView?: "ALL" | "REVIEW" };
        if (p.role) setRole(p.role);
        if (p.who) setWho(p.who);
        if (p.ownerView) setOwnerView(p.ownerView);
      }
      const lanesRaw = localStorage.getItem(LS_LANES);
      if (lanesRaw) setLanes(JSON.parse(lanesRaw));
    } catch {}
  }, []);

  /** Uložení do LS */
  useEffect(() => {
    try {
      localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
    } catch {}
  }, [tasks]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_WHO, JSON.stringify({ role, who, ownerView }));
    } catch {}
  }, [role, who, ownerView]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_LANES, JSON.stringify(lanes));
    } catch {}
  }, [lanes]);

  // Supabase test: pokusíme se načíst 1 řádek z tabulky `tasks` a výsledek vypíšeme do konzole
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("tasks").select("*").limit(1);
        if (error) console.error("❌ Supabase chyba:", error);
        else console.log("✅ Supabase funguje:", data);
      } catch (err) {
        console.error("❌ Supabase chyba (catch):", err);
      }
    })();
  }, []);

  /** Helper: lanesFor(employee) */
  const lanesFor = (emp: string) => lanes[emp] ?? DEFAULT_LANES;

  /** --------- CRUD úkolů --------- */
  const addTask = (partial: Omit<Task, "id" | "createdAt" | "updatedAt" | "status">) => {
    const lane = partial.lane || lanesFor(partial.assignee)[0];
    const t: Task = {
      id: uid(),
      status: "PENDING_ACCEPT",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      ...partial,
      lane,
    };
    setTasks((p) => [t, ...p]);
  };
  const updateTask = (id: string, patch: Partial<Task>) =>
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowISO() } : t)));
  const deleteTask = (id: string) => setTasks((p) => p.filter((t) => t.id !== id));

  /** --------- Modal otevřít / uložit --------- */
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
      createdAt: "",
      updatedAt: "",
    });
    setModalOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing({ ...task });
    setModalOpen(true);
  };
  const submitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const data = new FormData(e.currentTarget);
    const payload = {
      title: String(data.get("title") || "").trim(),
      assignee: String(data.get("assignee") || ""),
      priority: String(data.get("priority") || "Low") as Priority,
      due: String(data.get("due") || ""),
      description: String(data.get("description") || ""),
      lane: String(data.get("lane") || ""),
    };
    if (!payload.title) return alert("Název úkolu je povinný.");
    if (editing.id) updateTask(editing.id, payload);
    else addTask(payload as any);
    setModalOpen(false);
    setEditing(null);
  };

  /** --------- Práva a workflow akce --------- */
  const can = {
    accept: (t: Task) => role === "EMPLOYEE" && t.assignee === who && t.status === "PENDING_ACCEPT",
    decline: (t: Task) => role === "EMPLOYEE" && t.assignee === who && t.status === "PENDING_ACCEPT",
    inProgress: (t: Task) =>
      role === "EMPLOYEE" && t.assignee === who && (t.status === "ACCEPTED" || t.status === "RETURNED"),
    submitDone: (t: Task) =>
      role === "EMPLOYEE" &&
      t.assignee === who &&
      ["ACCEPTED", "IN_PROGRESS", "RETURNED"].includes(t.status),

    approveArchive: (t: Task) => role === "OWNER" && t.status === "SUBMITTED_DONE",
    returnTask:     (t: Task) => role === "OWNER" && t.status === "SUBMITTED_DONE",

    edit: (t: Task) => role === "OWNER" || (role === "EMPLOYEE" && t.assignee === who),
    remove: (_t: Task) => role === "OWNER",
  };

  const doAccept         = (t: Task) => updateTask(t.id, { status: "ACCEPTED", acceptedAt: nowISO() });
  const doDecline        = (t: Task) => updateTask(t.id, { status: "DECLINED" });
  const doInProgress     = (t: Task) => updateTask(t.id, { status: "IN_PROGRESS" });
  const doSubmitDone     = (t: Task) => {
    const note = prompt("Poznámka k dokončení (volitelné):", t.completionNote || "");
    updateTask(t.id, { status: "SUBMITTED_DONE", completedAt: nowISO(), completionNote: note || "" });
  };
  const doApproveArchive = (t: Task) => {
    const note = prompt("Poznámka (volitelné):", t.ownerReviewNote || "");
    updateTask(t.id, { status: "ARCHIVED", ownerVerifiedAt: nowISO(), ownerReviewNote: note || "" });
  };
  const doReturn = (t: Task) => {
    const note = prompt("Důvod vrácení (povinné):", "");
    if (!note) return;
    updateTask(t.id, { status: "RETURNED", ownerReviewNote: note });
  };

  /** --------- Pohledy --------- */
  // Majitel – „ALL“: sloupce jsou zaměstnanci (jako doteď)
  const ownerColumns = useMemo(() => {
    const order = EMPLOYEES.slice();
    const map: Record<string, Task[]> = Object.fromEntries(order.map((e) => [e, [] as Task[]]));
    for (const t of tasks) map[t.assignee]?.push(t);
    return { order, map };
  }, [tasks]);
  // Majitel – „REVIEW“: jen SUBMITTED_DONE
  const ownerReviewColumns = useMemo(() => {
    const order = EMPLOYEES.slice();
    const map: Record<string, Task[]> = Object.fromEntries(order.map((e) => [e, [] as Task[]]));
    for (const t of tasks) if (t.status === "SUBMITTED_DONE") map[t.assignee]?.push(t);
    return { order, map };
  }, [tasks]);
  // Zaměstnanec – jeho osobní lanes
  const employeeColumns = useMemo(() => {
    const order = lanesFor(who);
    const map: Record<string, Task[]> = Object.fromEntries(order.map((l) => [l, [] as Task[]]));
    for (const t of tasks) if (t.assignee === who) map[t.lane ?? order[0]]?.push(t);
    return { order, map };
  }, [tasks, who, lanes]);

  /** --------- Správa osobních sloupců (zaměstnanec) --------- */
  const addLane = () => {
    const name = prompt("Název nového sloupce:");
    if (!name) return;
    setLanes((prev) => {
      const current = lanesFor(who);
      if (current.includes(name)) return prev;
      return { ...prev, [who]: [...current, name] };
    });
  };
  const renameLane = (oldName: string) => {
    const name = prompt("Přejmenovat sloupec na:", oldName);
    if (!name || name === oldName) return;
    setLanes((prev) => {
      const list = lanesFor(who).map((l) => (l === oldName ? name : l));
      // přemapovat existující tasky
      setTasks((p) => p.map((t) => (t.assignee === who && t.lane === oldName ? { ...t, lane: name } : t)));
      return { ...prev, [who]: list };
    });
  };
  const removeLane = (name: string) => {
    const list = lanesFor(who);
    if (list.length <= 1) return alert("Musí zůstat alespoň jeden sloupec.");
    if (!confirm(`Smazat sloupec „${name}“? Úkoly přesuneme do prvního sloupce.`)) return;
    const first = list[0];
    setLanes((prev) => {
      const next = list.filter((l) => l !== name);
      setTasks((p) => p.map((t) => (t.assignee === who && t.lane === name ? { ...t, lane: first } : t)));
      return { ...prev, [who]: next };
    });
  };

  /** --------- Drag & Drop (zaměstnanec) --------- */
  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const onDropToLane = (e: React.DragEvent, laneName: string) => {
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.assignee !== who) return;
    updateTask(id, { lane: laneName });
  };

  /** --------- UI --------- */
  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6 md:p-8">
      {/* Horní lišta */}
      <header className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Přehled úkolů</h1>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Role:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md bg-zinc-800 px-3 py-2 outline-none"
            >
              <option value="OWNER">Majitel</option>
              <option value="EMPLOYEE">Zaměstnanec</option>
            </select>
          </div>

          {role === "EMPLOYEE" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Jsem:</span>
                <select
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  className="rounded-md bg-zinc-800 px-3 py-2 outline-none"
                >
                  {EMPLOYEES.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => openNew(who)}
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm"
              >
                + Nový úkol
              </button>

              <div className="flex gap-2">
                <button
                  onClick={addLane}
                  className="bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg text-sm"
                  title="Přidat osobní sloupec"
                >
                  + Přidat sloupec
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Pohled:</span>
                <div className="inline-flex rounded-lg overflow-hidden">
                  <button
                    className={`px-3 py-2 text-sm ${ownerView === "ALL" ? "bg-zinc-700" : "bg-zinc-800"}`}
                    onClick={() => setOwnerView("ALL")}
                  >
                    Vše
                  </button>
                  <button
                    className={`px-3 py-2 text-sm ${ownerView === "REVIEW" ? "bg-zinc-700" : "bg-zinc-800"}`}
                    onClick={() => setOwnerView("REVIEW")}
                    title="Úkoly odevzdané zaměstnanci, čekající na schválení"
                  >
                    Ke schválení
                  </button>
                </div>
              </div>

              <button
                onClick={() => openNew()}
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm"
              >
                + Nový úkol
              </button>
            </>
          )}
        </div>
      </header>

      {/* === Obsah podle role === */}
      {role === "OWNER" ? (
        // Majitel
        <div className="flex gap-6 overflow-x-auto pb-4">
          {(ownerView === "ALL" ? ownerColumns.order : ownerReviewColumns.order).map((emp) => {
            const list = (ownerView === "ALL" ? ownerColumns.map : ownerReviewColumns.map)[emp] || [];
            return (
              <div key={emp} className="bg-zinc-800 rounded-xl p-4 w-80 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">
                    {emp} <span className="text-gray-400 text-sm">({list.length})</span>
                  </h2>
                  <button
                    onClick={() => openNew(emp)}
                    className="text-sm text-gray-300 hover:text-white"
                    title="Přidat úkol tomuto zaměstnanci"
                  >
                    + Přidat úkol
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {list.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={() => openEdit(task)}
                      onDelete={() => {
                        if (confirm("Opravdu smazat tento úkol?")) deleteTask(task.id);
                      }}
                      actionsOwner={{
                        approve: can.approveArchive(task) ? () => doApproveArchive(task) : undefined,
                        returnBack: can.returnTask(task) ? () => doReturn(task) : undefined,
                      }}
                    />
                  ))}
                  {list.length === 0 && <div className="text-sm text-gray-400">Žádné úkoly</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Zaměstnanec – osobní sloupce
        <div className="flex gap-6 overflow-x-auto pb-4">
          {employeeColumns.order.map((laneName) => {
            const list = employeeColumns.map[laneName] || [];
            return (
              <div
                key={laneName}
                className="bg-zinc-800 rounded-xl p-4 w-80 flex-shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropToLane(e, laneName)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">
                    {laneName} <span className="text-gray-400 text-sm">({list.length})</span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-gray-300 hover:text-white"
                      onClick={() => openNew(who, laneName)}
                      title="Přidat úkol do tohoto sloupce"
                    >
                      + Úkol
                    </button>
                    <button
                      className="text-xs text-gray-400 hover:text-white"
                      onClick={() => renameLane(laneName)}
                      title="Přejmenovat sloupec"
                    >
                      Přejmenovat
                    </button>
                    <button
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => removeLane(laneName)}
                      title="Smazat sloupec"
                    >
                      Smazat
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 min-h-24">
                  {list.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      draggable
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onEdit={() => openEdit(task)}
                      onDelete={() => {
                        if (confirm("Opravdu smazat tento úkol?")) deleteTask(task.id);
                      }}
                      actionsEmployee={{
                        accept: can.accept(task) ? () => doAccept(task) : undefined,
                        decline: can.decline(task) ? () => doDecline(task) : undefined,
                        inProgress: can.inProgress(task) ? () => doInProgress(task) : undefined,
                        submitDone: can.submitDone(task) ? () => doSubmitDone(task) : undefined,
                      }}
                    />
                  ))}
                  {list.length === 0 && (
                    <div className="text-sm text-gray-400">Přetáhni sem úkol nebo klikni „+ Úkol“</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Modal: vytvořit / upravit ===== */}
      {modalOpen && editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-800 p-6 rounded-xl w-[95%] max-w-lg relative">
            <button
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
              className="absolute top-3 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>

            <h2 className="text-2xl font-semibold mb-4">{editing.id ? "Upravit úkol" : "Nový úkol"}</h2>

            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Název</label>
                <input
                  name="title"
                  defaultValue={editing.title}
                  placeholder="Např. Zavolat dodavateli…"
                  className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm mb-1">Zaměstnanec</label>
                  <select
                    name="assignee"
                    defaultValue={editing.assignee}
                    className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                    onChange={(e) => {
                      // při změně zaměstnance přepnout nabídku sloupců
                      const emp = e.target.value;
                      const first = lanesFor(emp)[0];
                      setEditing((prev) => (prev ? { ...prev, assignee: emp, lane: first } : prev));
                    }}
                  >
                    {EMPLOYEES.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-1">Priorita</label>
                  <select
                    name="priority"
                    defaultValue={editing.priority}
                    className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                  >
                    <option value="Low">Nízká</option>
                    <option value="Medium">Střední</option>
                    <option value="High">Vysoká</option>
                    <option value="Urgent">Naléhavá</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-1">Termín</label>
                  <input
                    type="date"
                    name="due"
                    defaultValue={editing.due || ""}
                    className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                />
                </div>
              </div>

              {/* Osobní sloupec – jen pro editaci (ať jde měnit bez drag&drop) */}
              <div>
                <label className="block text-sm mb-1">Zařazení (můj sloupec)</label>
                <select
                  name="lane"
                  value={editing.lane || lanesFor(editing.assignee)[0]}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, lane: e.target.value } : prev))
                  }
                  className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                >
                  {lanesFor(editing.assignee).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Popis</label>
                <textarea
                  name="description"
                  defaultValue={editing.description}
                  rows={4}
                  placeholder="Co se má udělat…"
                  className="w-full rounded-md bg-zinc-700 px-3 py-2 outline-none"
                />
              </div>

              {/* Info štítky */}
              {editing.id && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${STATUS_STYLE[editing.status].badge}`}>
                    {STATUS_CZ[editing.status]}
                  </span>
                  {editing.completionNote && (
                    <span className="px-2 py-0.5 rounded-full bg-zinc-600">
                      Pozn.: {editing.completionNote}
                    </span>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center">
                {editing.id ? (
                  <button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm"
                    onClick={() => {
                      if (confirm("Opravdu smazat tento úkol?")) {
                        deleteTask(editing.id);
                        setModalOpen(false);
                        setEditing(null);
                      }
                    }}
                  >
                    Smazat
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm"
                >
                  Uložit
                </button>
              </div>
            </form>

            {/* Workflow akce i v modalu */}
            {editing.id && (
              <div className="mt-4 flex flex-wrap gap-2">
                {can.accept(editing) && (
                  <button
                    className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                    onClick={() => doAccept(editing!)}
                  >
                    Přijmout
                  </button>
                )}
                {can.decline(editing) && (
                  <button
                    className="text-xs bg-zinc-600 hover:bg-zinc-700 px-2 py-1 rounded"
                    onClick={() => doDecline(editing!)}
                  >
                    Odmítnout
                  </button>
                )}
                {can.inProgress(editing) && (
                  <button
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded"
                    onClick={() => doInProgress(editing!)}
                  >
                    Označit „Rozpracováno“
                  </button>
                )}
                {can.submitDone(editing) && (
                  <button
                    className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded"
                    onClick={() => doSubmitDone(editing!)}
                  >
                    Odevzdat „Hotovo“
                  </button>
                )}
                {can.approveArchive(editing) && (
                  <button
                    className="text-xs bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded"
                    onClick={() => doApproveArchive(editing!)}
                  >
                    Schválit a archivovat
                  </button>
                )}
                {can.returnTask(editing) && (
                  <button
                    className="text-xs bg-orange-600 hover:bg-orange-700 px-2 py-1 rounded"
                    onClick={() => doReturn(editing!)}
                  >
                    Vrátit k dopracování
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** ====== Prezentace jedné kartičky ====== */
function TaskCard({
  task,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
  actionsOwner,
  actionsEmployee,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  actionsOwner?: { approve?: () => void; returnBack?: () => void };
  actionsEmployee?: {
    accept?: () => void;
    decline?: () => void;
    inProgress?: () => void;
    submitDone?: () => void;
  };
}) {
  const p = PRIORITY_STYLE[task.priority];
  const st = STATUS_STYLE[task.status];
  return (
    <div
      className={`bg-zinc-700 rounded-lg p-3 hover:bg-zinc-600 transition ${st.cardRing}`}
      draggable={draggable}
      onDragStart={onDragStart}
      title={task.description || ""}
    >
      <div className="flex justify-between items-start">
        <button onClick={onEdit} className="text-left font-medium leading-tight hover:underline">
          {task.title}
        </button>
        <span className={`text-xs px-2 py-0.5 rounded-full ${p.cls}`}>{p.label}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
        <span className={`px-2 py-0.5 rounded-full ${st.badge}`}>{STATUS_CZ[task.status]}</span>
        <span className="text-gray-300">{task.due ? new Date(task.due).toLocaleDateString() : "Bez termínu"}</span>
        {task.lane && <span className="px-2 py-0.5 rounded-full bg-zinc-600">Sloupec: {task.lane}</span>}
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {actionsEmployee?.accept && (
          <button className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded" onClick={actionsEmployee.accept}>
            Přijmout
          </button>
        )}
        {actionsEmployee?.decline && (
          <button className="text-xs bg-zinc-600 hover:bg-zinc-700 px-2 py-0.5 rounded" onClick={actionsEmployee.decline}>
            Odmítnout
          </button>
        )}
        {actionsEmployee?.inProgress && (
          <button className="text-xs bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded" onClick={actionsEmployee.inProgress}>
            Rozpracováno
          </button>
        )}
        {actionsEmployee?.submitDone && (
          <button className="text-xs bg-green-600 hover:bg-green-700 px-2 py-0.5 rounded" onClick={actionsEmployee.submitDone}>
            Odevzdat „Hotovo“
          </button>
        )}

        {actionsOwner?.approve && (
          <button className="text-xs bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded" onClick={actionsOwner.approve}>
            Schválit & Archivovat
          </button>
        )}
        {actionsOwner?.returnBack && (
          <button className="text-xs bg-orange-600 hover:bg-orange-700 px-2 py-0.5 rounded" onClick={actionsOwner.returnBack}>
            Vrátit k dopracování
          </button>
        )}

        <button className="text-xs bg-zinc-600 hover:bg-zinc-700 px-2 py-0.5 rounded" onClick={onEdit}>
          Upravit
        </button>
        <button className="text-xs bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded" onClick={onDelete}>
          Smazat
        </button>
      </div>
    </div>
  );
}
