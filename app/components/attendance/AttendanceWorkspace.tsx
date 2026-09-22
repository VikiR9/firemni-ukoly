"use client";
import { LimmitLogo } from "@/lib/logo";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth";
import {
  ABSENCE_STATUS,
  LEAVE_STATUS,
  EVENT_NAMES,
  addDays,
  monday,
  businessDay,
  dayText,
  timeText,
  stamp,
  minutesText,
  hoursText,
  daysText,
  vacationLabel,
  type AttendanceData,
  type LeaveRequest,
  type Absence,
} from "@/lib/attendance";
import Modal from "../tasks/Modal";
import { Avatar } from "../tasks/TaskDialogs";
import ui from "../tasks/Workspace.module.css";
import s from "./Attendance.module.css";
import { AfterHoursControl, AfterHoursReport } from "./AfterHoursWork";
type Editor = {
  onBehalf?: boolean;
  kind: string;
  id?: string;
  decision?: string;
  label: string;
  minutes?: number;
};
type Tab =
  "overview" | "requests" | "sessions" | "approvals" | "absences" | "history" | "after_hours";

export default function AttendanceWorkspace({
  absenceModule = false,
}: {
  absenceModule?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<AttendanceData | null>(null),
    [error, setError] = useState(""),
    [authRequired, setAuthRequired] = useState(false),
    [forbidden, setForbidden] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [year, setYear] = useState(new Date().getFullYear()),
    [team, setTeam] = useState(absenceModule),
    [tab, setTab] = useState<Tab>(absenceModule ? "absences" : "overview"),
    [person, setPerson] = useState("all"),
    [absenceFilter, setAbsenceFilter] = useState("open");
  const [editor, setEditor] = useState<Editor | null>(null),
    [formError, setFormError] = useState(""),
    [note, setNote] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [timeFrom, setTimeFrom] = useState("08:30"),
    [timeTo, setTimeTo] = useState("09:30"),
    [planDays, setPlanDays] = useState<string[]>([]),
    [planLoading, setPlanLoading] = useState(false),
    [limit, setLimit] = useState(100);
  const formId = useRef("");
  const [targetUsername, setTargetUsername] = useState("");
  const [remainingDays, setRemainingDays] = useState("");
  const [vacationPart, setVacationPart] = useState("FULL");
  const planSequence = useRef(0);
  const initialized = useRef(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const sequence = useRef(0);
  const saving = useRef(false);
  const refresh = useCallback(async () => {
    if (saving.current) return;
    const seq = ++sequence.current;
    try {
      const res = await fetch(`/api/attendance?year=${year}&team=${team}`, {
        cache: "no-store",
      });
      const result = await res.json();
      if (seq !== sequence.current) return;
      setAuthRequired(res.status === 401);
      setForbidden(res.status === 403);
      if (!res.ok) throw new Error(result.error);
      if (!initialized.current) {
        initialized.current = true;
        if (result.user.role === "OWNER") setTeam(true);
      }
      setData(result);
      setError("");
    } catch (e) {
      if (seq === sequence.current)
        setError(
          e instanceof Error ? e.message : "Docházku se nepodařilo načíst.",
        );
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [year, team]);
  useEffect(() => {
    void refresh();
    const active = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(active, 30000);
    window.addEventListener("online", active);
    document.addEventListener("visibilitychange", active);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", active);
      document.removeEventListener("visibilitychange", active);
    };
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (saving.current) return false;
    setBusy(true);
    saving.current = true;
    ++sequence.current;
    setFormError("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, year, team, ...payload }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (result.server_now) setData(result);
      else {
        saving.current = false;
        await refresh();
      }
      setError("");
      setToast(
        action === "checkin"
          ? "Příchod je zaznamenaný."
          : action === "checkout"
            ? "Odchod je zaznamenaný."
            : action === "after_hours_start"
              ? "Práce mimo pracovní dobu je spuštěná."
              : action === "after_hours_stop"
                ? "Práce mimo pracovní dobu je ukončená."
                : "Změna je uložená.",
      );
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Spojení se nezdařilo.";
      setFormError(message);
      if (!editor) setError(message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (authRequired)
    return (
      <main className={s.login}>
        <h1 className={ui.heading}>Přihlášení k docházce</h1>
        <p className={s.muted}>
          Docházka používá ověřené přihlášení na serveru. Přihlaste se prosím
          znovu svým jménem a heslem.
        </p>
        <Link
          className={ui.primary}
          href={`/login?next=${absenceModule ? "/absence" : "/dochazka"}`}
        >
          Přejít na přihlášení
        </Link>
      </main>
    );
  if (forbidden)
    return (
      <main className={s.login}>
        <h1 className={ui.heading}>Přehled pro majitele</h1>
        <p className={s.muted}>{error}</p>
        <Link className={ui.primary} href="/dochazka">
          Moje docházka
        </Link>
      </main>
    );
  if (!data)
    return (
      <main className={s.login}>
        <h1 className={ui.heading}>Docházka</h1>
        <p className={s.muted}>
          {loading ? "Načítám pracovní prostor…" : error}
        </p>
        {!loading && (
          <button className={ui.primary} onClick={() => void refresh()}>
            Zkusit znovu
          </button>
        )}
      </main>
    );
  const me = data.user,
    owner = me.role === "OWNER";
  const canManageLeave = owner && me.username === "VIKTOR";
  const editorUsername = editor?.onBehalf ? targetUsername : me.username;
  const vacationDays = (minutes: number, username: string) =>
    daysText(minutes / ((data.people.find((p) => p.username === username)?.daily_hours ?? me.daily_hours) * 60));
  const nowTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.server_now));
  const vacationNow = (r: LeaveRequest) => !r.vacation_part || (!!r.time_from && !!r.time_to && nowTime >= r.time_from.slice(0, 5) && nowTime < r.time_to.slice(0, 5));
  const workEndFor = (username: string) => {
    const [h, m] = data.rules.work_start.split(":").map(Number);
    const hours = data.people.find((p) => p.username === username)?.daily_hours ?? me.daily_hours;
    return `${String(h + hours).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const hiddenWorklog = !owner && ["KARINA", "VENDULA"].includes(me.username);
  const name = (username: string) =>
    data.people.find((p) => p.username === username)?.display_name || username;
  const selected = (username: string) =>
    team ? person === "all" || username === person : username === me.username;
  const requests = data.requests.filter((r) => selected(r.username));
  const absences = data.absences.filter(
    (a) => selected(a.username) && (hiddenWorklog || a.minutes > 0),
  );
  const sessions = data.sessions.filter((z) => selected(z.username));
  const ownBalance = data.balances.find((b) => b.username === me.username) || {
    approved: 0,
    pending: 0,
    remaining_minutes: me.daily_hours * data.rules.vacation_days * 60,
    entitlement_minutes: me.daily_hours * data.rules.vacation_days * 60,
    deducted_minutes: 0,
  };
  const homeToday = data.home_days.some(
    (h) => h.username === me.username && h.day === data.today,
  );
  const active = data.sessions.find(
    (z) => z.username === me.username && z.day === data.today && !z.ended_at,
  );
  const isWorking = data.is_working ?? !!active;
  const todayAbsence = data.absences.find(
    (a) => a.username === me.username && a.day === data.today,
  );
  const vacationToday = data.requests.some(
    (r) =>
      r.username === me.username &&
      r.kind === "VACATION" &&
      vacationNow(r) &&
      r.status === "APPROVED" &&
      r.date_from <= data.today &&
      r.date_to >= data.today,
  );
  const nextWeek = addDays(monday(data.today), 7),
    weekDays = Array.from({ length: 5 }, (_, i) => addDays(nextWeek, i));
  const dashboardWeek = addDays(monday(data.today), weekOffset * 7);
  const dashboardDays = Array.from({ length: 5 }, (_, i) =>
    addDays(dashboardWeek, i),
  );
  const outlookRequests = data.week_requests ?? data.requests;
  const outlookHome = data.week_home_days ?? data.home_days;
  const weeklyDashboard =
    !absenceModule &&
    tab === "overview" &&
    year === Number(data.today.slice(0, 4));
  const weekLeaves = outlookRequests.filter(
    (r) =>
      selected(r.username) &&
      ["APPROVED", "PENDING"].includes(r.status) &&
      r.date_from <= addDays(dashboardWeek, 4) &&
      r.date_to >= dashboardWeek,
  );
  const weekHomeCount = outlookHome.filter(
    (h) =>
      selected(h.username) &&
      dashboardDays.includes(h.day) &&
      !weekLeaves.some(
        (r) =>
          r.username === h.username &&
          r.kind === "VACATION" &&
          !r.vacation_part &&
          r.status === "APPROVED" &&
          r.date_from <= h.day &&
          r.date_to >= h.day,
      ),
  ).length;
  const weekVacationCount = weekLeaves
    .filter((r) => r.kind === "VACATION" && r.status === "APPROVED")
    .reduce(
      (n, r) =>
        n +
        dashboardDays.filter(
          (d) => businessDay(d) && r.date_from <= d && r.date_to >= d,
        ).length * (r.vacation_part ? 0.5 : 1),
      0,
    );
  const pending = requests.filter((r) => r.status === "PENDING");
  const unresolved = absences.filter((a) => a.status !== "EXCUSED");
  const filteredAbsences = absences.filter(
    (a) =>
      absenceFilter === "all" ||
      (absenceFilter === "open"
        ? a.status !== "EXCUSED"
        : a.status === "EXCUSED"),
  );
  const planWeek = monday(from || data.today);
  const planWeekDays = Array.from({ length: 5 }, (_, i) =>
    addDays(planWeek, i),
  );
  const loadPlan = async (date: string, username = editorUsername) => {
    if (!date) return;
    const seq = ++planSequence.current;
    setFrom(date);
    setPlanLoading(true);
    setFormError("");
    try {
      const years = [...new Set([monday(date).slice(0, 4), addDays(monday(date), 4).slice(0, 4)])];
      const results = await Promise.all(years.map(async (planYear) => {
        const res = await fetch(
          `/api/attendance?year=${planYear}&team=${canManageLeave}`,
          { cache: "no-store" },
        );
        const result = await res.json();
        if (!res.ok) throw Error(result.error);
        return result as AttendanceData;
      }));
      if (seq !== planSequence.current) return;
      setPlanDays(
        results.flatMap((result) => result.home_days)
          .filter(
            (h: { day: string; username: string }) =>
              h.username === username && h.day >= monday(date) && h.day <= addDays(monday(date), 4),
          )
          .map((h: { day: string }) => h.day),
      );
    } catch (e) {
      if (seq !== planSequence.current) return;
      setFormError(
        e instanceof Error ? e.message : "Plán se nepodařilo načíst.",
      );
      return;
    } finally {
      if (seq === planSequence.current) setPlanLoading(false);
    }
  };
  const open = (ed: Editor) => {
    ++planSequence.current;
    setPlanLoading(false);
    const target = ed.onBehalf
      ? data.people.find((p) => p.username === person && p.username !== me.username)?.username ||
        data.people.find((p) => p.role === "EMPLOYEE")?.username || ""
      : me.username;
    setTargetUsername(target);
    setRemainingDays("");
    setVacationPart("FULL");
    setEditor(ed);
    setFormError("");
    setNote("");
    setFrom(data.today);
    setTo(data.today);
    setTimeFrom(data.rules.work_start.slice(0, 5));
    setTimeTo(workEndFor(target));
    formId.current = crypto.randomUUID();
    if (ed.kind === "PLAN") void loadPlan(data.today, target);
    setPlanDays(
      data.home_days
        .filter((h) => h.username === target && weekDays.includes(h.day))
        .map((h) => h.day),
    );
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    let action = editor.kind,
      payload: Record<string, unknown> = {
        id: editor.id,
        note,
        decision: editor.decision,
      };
    if (editor.kind === "VACATION" || editor.kind === "PERSONAL") {
      action = "request";
      payload = {
        id: formId.current,
        kind: editor.kind,
        date_from: from,
        date_to: editor.kind === "PERSONAL" || vacationPart !== "FULL" ? from : to,
        vacation_part: editor.kind === "VACATION" && vacationPart !== "FULL" ? vacationPart : null,
        time_from: timeFrom,
        time_to: timeTo,
        note,
      };
    }
    if (editor.kind === "PLAN") {
      action = "home_plan";
      if (planLoading || formError) return;
      payload = { week: planWeek, days: planDays };
    }
    if (editor.kind === "deduct_vacation")
      payload.expected_minutes = editor.minutes;
    if (editor.kind === "BALANCE") {
      action = "set_vacation_balance";
      payload = { remaining_days: Number(remainingDays), note };
    }
    if (editor.onBehalf) payload.target_username = targetUsername;
    if (await run(action, payload)) setEditor(null);
  };
  const requestAction = (r: LeaveRequest, decision: string) =>
    open({
      kind: "review_request",
      id: r.id,
      decision,
      label: `${decision === "APPROVED" ? "Schválit" : "Zamítnout"} dovolenou · ${name(r.username)}`,
    });
  const absenceAction = (a: Absence, kind: string, decision?: string) =>
    open({
      kind,
      id: a.id,
      decision,
      minutes: a.minutes,
      label: `${kind === "grant_personal" ? "Převést na osobní volno" : kind === "deduct_vacation" ? "Odečíst z dovolené" : kind === "reverse_deduction" ? "Vrátit odečet dovolené" : kind === "reverse_excuse" ? "Vrátit schválení omluvenky" : kind === "ask_excuse" ? "Vyžádat omluvenku" : kind === "submit_excuse" ? "Doplnit omluvenku" : decision === "EXCUSED" ? "Převést na osobní volno" : "Zamítnout omluvenku"} · ${dayText(a.day)}`,
    });
  const tabs: { id: Tab; label: string }[] = absenceModule
    ? [
        { id: "absences", label: "Absence a omluvenky" },
        { id: "sessions", label: "Příchody a odchody" },
        { id: "history", label: "Historie změn" },
      ]
    : [
        { id: "overview", label: "Přehled" },
        { id: "requests", label: "Dovolená a osobní volno" },
        ...(canManageLeave && data.after_hours?.can_view_reports
          ? [{ id: "after_hours" as Tab, label: "Práce mimo pracovní dobu" }]
          : []),
        ...(!hiddenWorklog
          ? [{ id: "sessions" as Tab, label: "Příchody a odchody" }]
          : []),
        ...(owner && team
          ? [{ id: "approvals" as Tab, label: "Ke schválení" }]
          : []),
        {
          id: "absences",
          label: hiddenWorklog ? "Žádosti o omluvenku" : "Absence",
        },
        ...(!hiddenWorklog
          ? [{ id: "history" as Tab, label: "Historie" }]
          : []),
      ];
  const selectTab = (t: Tab) => {
    setTab(t);
    setLimit(100);
  };
  return (
    <div className={ui.workspace}>
      <aside className={ui.sidebar} aria-label="Docházka">
        <div className={ui.brand}>
          <LimmitLogo height={34} variant="light" />
        </div>
        <div className={ui.sideSection}>
          <span className={ui.sideLabel}>PRACOVNÍ DOBA</span>
          <Link className={s.sidebarLink} href="/">
            ← Zpět na úkoly
          </Link>
          {!absenceModule && (
            <>
              <button
                className={`${ui.sideButton} ${!team ? ui.sideActive : ""}`}
                onClick={() => {
                  setTeam(false);
                  setPerson("all");
                  selectTab("overview");
                }}
              >
                Moje docházka
              </button>
              {owner && (
                <button
                  className={`${ui.sideButton} ${team ? ui.sideActive : ""}`}
                  onClick={() => {
                    setTeam(true);
                    setPerson("all");
                    selectTab("overview");
                  }}
                >
                  Docházka týmu
                </button>
              )}
            </>
          )}
          {owner && (
            <Link
              className={`${s.sidebarLink} ${absenceModule ? ui.sideActive : ""}`}
              href="/absence"
            >
              Absence a omluvenky
            </Link>
          )}
          {absenceModule && (
            <Link className={s.sidebarLink} href="/dochazka">
              Dovolená a home office
            </Link>
          )}
        </div>

        <div className={ui.sideFooter}>
          <Avatar name={me.display_name} />
          <div>
            <strong>{me.display_name}</strong>
            <small>
              {owner ? "Majitel" : "Člen týmu"} · {me.daily_hours} hodin denně
            </small>
          </div>
          <button
            aria-label="Odhlásit účet"
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
          >
            ↪
          </button>
        </div>
      </aside>
      <main className={ui.main}>
        <header className={ui.topline}>
          <div>
            <span className={ui.eyebrow}>
              {dayText(data.today)} / EUROPE–PRAGUE
            </span>
            <h1 className={ui.heading}>
              {absenceModule
                ? "Absence a omluvenky"
                : team
                  ? tab === "overview" &&
                    year === Number(data.today.slice(0, 4))
                    ? weekOffset === 0
                      ? "Tento týden"
                      : "Příští týden"
                    : "Docházka týmu"
                  : "Moje docházka"}
            </h1>
            <p className={ui.subtitle}>
              {absenceModule
                ? "Přehled mezer v pracovní době a jejich vysvětlení."
                : "Přehled volna, práce z domova a času u počítače."}
            </p>
          </div>
          <div className={ui.topActions}>
            {canManageLeave && team && (
              <button className={ui.primary} disabled={busy}
                onClick={() => open({ kind: "VACATION", label: "Nastavit volno kolegovi", onBehalf: true })}>
                Nastavit volno kolegovi
              </button>
            )}
            <button
              className={ui.secondary}
              onClick={() => void refresh()}
              disabled={busy}
            >
              ↻ Obnovit
            </button>
            {!absenceModule && (
              <button
                className={ui.primary}
                onClick={() =>
                  open({ kind: "VACATION", label: "Žádost o dovolenou" })
                }
              >
                + Dovolená
              </button>
            )}
          </div>
        </header>
        <div className={s.mobileNav}>
          {!absenceModule && (
            <>
              <button
                className={!team ? ui.primary : ui.secondary}
                onClick={() => {
                  setTeam(false);
                  selectTab("overview");
                }}
              >
                Moje docházka
              </button>
              {owner && (
                <button
                  className={team ? ui.primary : ui.secondary}
                  onClick={() => {
                    setTeam(true);
                    selectTab("overview");
                  }}
                >
                  Celý tým
                </button>
              )}
            </>
          )}
          {owner && (
            <Link
              className={ui.secondary}
              href={absenceModule ? "/dochazka" : "/absence"}
            >
              {absenceModule ? "Docházka" : "Absence"}
            </Link>
          )}
        </div>
        {error && (
          <div className={s.error} role="alert">
            {error}
          </div>
        )}
        {(data.personal_totals ?? [])
          .filter((p) => p.minutes > p.threshold_minutes)
          .map((p) => (
            <div className={s.error} role="alert" key={p.username}>
              <strong>
                {p.display_name || name(p.username)}: překročeno 5 dnů osobního
                volna za rok {p.year}.
              </strong>
              <br />
              {minutesText(p.minutes)} z hranice{" "}
              {minutesText(p.threshold_minutes)}. Zahrnuje schválené omluvenky.
              Od ledna se počítá nový rok.
            </div>
          ))}
        {!absenceModule && !team && year === Number(data.today.slice(0, 4)) && (
          <section className={s.presence} data-online={isWorking}>
            <div>
              <span className={ui.eyebrow}>
                {isWorking ? (
                  <>
                    <i className={s.liveDot} />
                    PŘIHLÁŠENO K PRÁCI
                  </>
                ) : homeToday ? (
                  "DNES PRÁCE Z DOMOVA"
                ) : (
                  "DNEŠNÍ PRACOVNÍ DEN"
                )}
              </span>
              <h2>
                {vacationToday
                  ? "Dnes máte dovolenou"
                  : isWorking
                    ? hiddenWorklog
                      ? "Jste přihlášeni k práci"
                      : `Pracujete od ${active ? timeText(active.started_at) : ""}`
                    : homeToday
                      ? "Potvrďte příchod k počítači"
                      : "Na dnešek není nahlášen home office"}
              </h2>
              <p>
                {homeToday
                  ? hiddenWorklog
                    ? "Při každém odchodu se odhlaste od práce."
                    : `Pracovní okno ${data.rules.work_start.slice(0, 5)}–${data.rules.work_end.slice(0, 5)} · ${me.daily_hours} hodin. Při každém odchodu se odhlaste od práce.`
                  : "Home office můžete zadat i na dnešek."}
              </p>
              {!hiddenWorklog && !!todayAbsence?.minutes && (
                <p className={ui.late}>
                  Dnešní evidovaná absence: {minutesText(todayAbsence.minutes)}{" "}
                  · {ABSENCE_STATUS[todayAbsence.status]}
                </p>
              )}
            </div>
            <div className={s.presenceActions}>
              {homeToday && (isWorking || !vacationToday) && (
                <button
                  disabled={busy || (!isWorking && data.after_hours?.is_working)}
                  className={isWorking ? ui.secondary : ui.primary}
                  onClick={() => void run(isWorking ? "checkout" : "checkin")}
                >
                  {busy
                    ? "Ukládání…"
                    : isWorking
                      ? "Končím / odcházím od PC"
                      : "Začínám pracovat"}
                </button>
              )}
              <button
                className={ui.secondary}
                onClick={() =>
                  open({ kind: "PERSONAL", label: "Zaznamenat osobní volno" })
                }
              >
                + Osobní volno
              </button>
              <button
                className={ui.secondary}
                onClick={() => open({ kind: "PLAN", label: "Home office" })}
              >
                + Home office
              </button>
              <small>Příchody a odchody potvrzujete tlačítky.</small>
              {data.after_hours?.is_working && <small>Nejprve ukončete práci mimo pracovní dobu.</small>}
            </div>
          </section>
        )}
        {!absenceModule && data.after_hours && (
          <AfterHoursControl
            working={data.after_hours.is_working}
            regularWorking={isWorking}
            busy={busy}
            onToggle={() => void run(data.after_hours?.is_working ? "after_hours_stop" : "after_hours_start")}
          />
        )}
        {weeklyDashboard ? (
          <section className={ui.stats} aria-label="Souhrn zobrazeného týdne">
            <div className={`${ui.stat} ${ui.statAccent}`}>
              <span>Home office</span>
              <strong>{weekHomeCount}</strong>
              <small>
                {team ? "dnů v týmu" : "vašich dnů"} ve zvoleném týdnu
              </small>
            </div>
            <button className={ui.stat} onClick={() => selectTab("requests")}>
              <span>Schválená dovolená</span>
              <strong>{daysText(weekVacationCount)}</strong>
              <small>
                {team ? "v týmu" : "vaší dovolené"} ve zvoleném týdnu
              </small>
            </button>
            <button className={ui.stat} onClick={() => selectTab("requests")}>
              <span>Osobní volno</span>
              <strong>
                {weekLeaves.filter((r) => r.kind === "PERSONAL").length}
              </strong>
              <small>záznamů ve zvoleném týdnu</small>
            </button>
            <button
              className={`${ui.stat} ${ui.statWarning}`}
              onClick={() => selectTab(team ? "approvals" : "requests")}
            >
              <span>Čekající dovolené</span>
              <strong>
                {
                  weekLeaves.filter(
                    (r) => r.kind === "VACATION" && r.status === "PENDING",
                  ).length
                }
              </strong>
              <small>žádostí pro zvolený týden</small>
            </button>
          </section>
        ) : (
          <section className={ui.stats}>
            <button
              className={`${ui.stat} ${ui.statAccent}`}
              onClick={() => selectTab("requests")}
            >
              <span>{team ? "Čekající žádosti" : "Zbývá dovolené"}</span>
              <strong>
                {team
                  ? pending.length
                  : vacationDays(ownBalance.remaining_minutes, me.username)}
              </strong>
              <small>
                {team
                  ? "ke schválení"
                  : `z ${vacationDays(ownBalance.entitlement_minutes, me.username)} ročně`}
              </small>
            </button>
            <button className={ui.stat} onClick={() => selectTab("requests")}>
              <span>{team ? "Osobní volno" : "Schválená dovolená"}</span>
              <strong>
                {team
                  ? requests.filter(
                      (r) => r.kind === "PERSONAL" && r.status === "APPROVED",
                    ).length
                  : daysText(ownBalance.approved)}
              </strong>
              <small>{team ? "povinné záznamy" : "včetně plánované"}</small>
            </button>
            <button
              className={ui.stat}
              onClick={() => selectTab(hiddenWorklog ? "requests" : "sessions")}
            >
              <span>{team ? "Dnes přihlášeno" : "Čeká na schválení"}</span>
              <strong>
                {team
                  ? data.sessions.filter(
                      (z) =>
                        z.day === data.today &&
                        !z.ended_at &&
                        selected(z.username),
                    ).length
                  : daysText(ownBalance.pending)}
              </strong>
              <small>
                {team ? "k práci na home office" : "rezervované dny"}
              </small>
            </button>
            <button
              className={`${ui.stat} ${ui.statWarning}`}
              onClick={() => selectTab("absences")}
            >
              <span>
                {hiddenWorklog ? "Žádosti o omluvenku" : "Absence k vyřešení"}
              </span>
              <strong>{unresolved.length}</strong>
              <small>
                {hiddenWorklog
                  ? "k vyřízení"
                  : minutesText(
                      unresolved.reduce((sum, a) => sum + a.minutes, 0),
                    )}
              </small>
            </button>
          </section>
        )}
        <div className={s.filterBar}>
          <select
            className={ui.select}
            aria-label="Rok docházky"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from(
              { length: 5 },
              (_, i) => new Date().getFullYear() - 2 + i,
            ).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {team && (
            <select
              className={ui.select}
              aria-label="Zaměstnanec"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="all">Všichni zaměstnanci</option>
              {data.people.map((p) => (
                <option key={p.username} value={p.username}>
                  {p.display_name}
                </option>
              ))}
            </select>
          )}
          <span className={s.muted}>
            {!hiddenWorklog && <>Serverový čas: {timeText(data.server_now)}</>}
          </span>
        </div>
        <div className={ui.tabs} role="tablist" aria-label="Pohled docházky">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`${ui.tab} ${tab === t.id ? ui.tabActive : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "after_hours" && canManageLeave && data.after_hours?.can_view_reports && (
          <AfterHoursReport
            sessions={data.after_hours.sessions.filter((session) => selected(session.username))}
            year={year}
          />
        )}
        {owner &&
          team &&
          ["overview", "sessions", "absences"].includes(tab) && (
            <section className={s.section}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Odpracováno za den</h2>
                  <p className={s.muted}>
                    Práce v pracovní době oproti dennímu plánu. Karina a Vendula
                    7 h, ostatní 9 h. Rozdíl do plánu zahrnuje i schválené
                    volno; k řešení slouží neomluvená absence.
                  </p>
                </div>
              </div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Zaměstnanec / den</th>
                      <th>Odpracováno / plán</th>
                      <th>Rozdíl do plánu</th>
                      <th>Neomluvená absence</th>
                      <th>Vyřízení</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.daily_work ?? [])
                      .filter(
                        (d) =>
                          selected(d.username) &&
                          (tab !== "overview" || dashboardDays.includes(d.day)),
                      )
                      .slice(0, limit)
                      .map((d) => {
                        const a = data.absences.find(
                          (a) => a.id === d.absence_id,
                        );
                        return (
                          <tr key={`${d.username}-${d.day}`}>
                            <td>
                              <strong>{name(d.username)}</strong>
                              <small>{dayText(d.day)}</small>
                            </td>
                            <td>
                              {minutesText(d.worked_minutes)} /{" "}
                              {hoursText(d.target_minutes)} h
                              {d.unclosed && (
                                <small className={ui.late}>
                                  {d.final
                                    ? "Chybí odhlášení · čas není potvrzený"
                                    : "Právě přihlášeno"}
                                </small>
                              )}
                            </td>
                            <td>
                              {minutesText(
                                Math.max(
                                  0,
                                  d.target_minutes - d.worked_minutes,
                                ),
                              )}
                              <small>
                                {d.final
                                  ? "Pracovní doba skončila"
                                  : "Den ještě probíhá"}
                              </small>
                            </td>
                            <td>
                              {minutesText(
                                a?.status === "EXCUSED" ? 0 : d.missing_minutes,
                              )}
                              {a?.status === "EXCUSED" && (
                                <small>Vyřízeno</small>
                              )}
                            </td>
                            <td>
                              <div className={s.tableActions}>
                                {a &&
                                  a.status !== "EXCUSED" &&
                                  d.missing_minutes > 0 &&
                                  a.username !== me.username && (
                                    <>
                                      {!["REQUESTED", "SUBMITTED"].includes(
                                        a.status,
                                      ) && (
                                        <button
                                          className={ui.secondary}
                                          onClick={() =>
                                            absenceAction(a, "ask_excuse")
                                          }
                                        >
                                          Vyžádat omluvenku
                                        </button>
                                      )}
                                      <button
                                        className={ui.secondary}
                                        disabled={!d.final}
                                        title={
                                          !d.final
                                            ? "Dostupné po skončení pracovní doby"
                                            : undefined
                                        }
                                        onClick={() =>
                                          absenceAction(a, "grant_personal")
                                        }
                                      >
                                        Osobní volno
                                      </button>
                                      <button
                                        className={ui.secondary}
                                        disabled={!d.final}
                                        title={
                                          !d.final
                                            ? "Dostupné po skončení pracovní doby"
                                            : undefined
                                        }
                                        onClick={() =>
                                          absenceAction(a, "deduct_vacation")
                                        }
                                      >
                                        Odečíst z dovolené
                                      </button>
                                      {a.status === "SUBMITTED" && (
                                        <small>
                                          Omluvenka: {a.explanation}
                                        </small>
                                      )}
                                    </>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!(data.daily_work ?? []).some(
                (d) =>
                  selected(d.username) &&
                  (tab !== "overview" || dashboardDays.includes(d.day)),
              ) && (
                <p className={s.empty}>
                  Pro tento pohled zatím nejsou pracovní dny na home office.
                </p>
              )}
            </section>
          )}
        {tab === "overview" && (
          <>
            {year === Number(data.today.slice(0, 4)) && (
              <section className={s.section}>
                <div className={s.sectionHeader}>
                  <div>
                    <h2>
                      {team
                        ? "Týdenní přehled týmu"
                        : weekOffset === 0
                          ? "Můj aktuální týden"
                          : "Můj příští týden"}
                    </h2>
                    <p className={s.muted}>
                      {dayText(dashboardWeek)} –{" "}
                      {dayText(addDays(dashboardWeek, 4))}
                    </p>
                  </div>
                  <div className={s.actions} aria-label="Zobrazený týden">
                    <button
                      aria-pressed={weekOffset === 0}
                      className={weekOffset === 0 ? ui.primary : ui.secondary}
                      onClick={() => setWeekOffset(0)}
                    >
                      Tento týden
                    </button>
                    <button
                      aria-pressed={weekOffset === 1}
                      className={weekOffset === 1 ? ui.primary : ui.secondary}
                      onClick={() => setWeekOffset(1)}
                    >
                      Příští týden →
                    </button>
                  </div>
                </div>
                <p className={s.muted}>
                  {weekOffset === 0
                    ? team
                      ? "Aktuální plán docházky. Rozklikněte zaměstnance pro jeho příchody a odchody."
                      : "Váš aktuální plán práce, dovolené a osobního volna."
                    : "Výhled podle zadaných plánů."}
                </p>
                <div className={s.tableWrap}>
                  <table
                    className={`${s.table} ${s.weekTable} ${!team ? s.ownWeek : ""}`}
                  >
                    <thead>
                      <tr>
                        <th>Zaměstnanec</th>
                        {dashboardDays.map((d, i) => (
                          <th key={d} data-today={d === data.today}>
                            {
                              [
                                "Pondělí",
                                "Úterý",
                                "Středa",
                                "Čtvrtek",
                                "Pátek",
                              ][i]
                            }
                            <small>
                              {dayText(d)}
                              {d === data.today ? " · dnes" : ""}
                            </small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.people
                        .filter((p) => selected(p.username))
                        .map((p) => (
                          <tr key={p.username}>
                            <td>
                              <button
                                className={ui.quiet}
                                onClick={() => {
                                  setPerson(p.username);
                                  selectTab("sessions");
                                }}
                              >
                                <strong>{p.display_name}</strong>
                              </button>
                              <small>{p.daily_hours} h denně</small>
                            </td>
                            {dashboardDays.map((d) => {
                              const leaves = outlookRequests.filter(
                                (r) =>
                                  r.username === p.username &&
                                  ["PENDING", "APPROVED"].includes(r.status) &&
                                  r.date_from <= d &&
                                  r.date_to >= d,
                              );
                              const vacation = leaves.find(
                                (r) => r.kind === "VACATION",
                              );
                              const personal = leaves.filter(
                                (r) => r.kind === "PERSONAL",
                              );
                              const home = outlookHome.some(
                                (h) => h.username === p.username && h.day === d,
                              );
                              const mode = !businessDay(d)
                                ? "off"
                                : vacation
                                  ? vacation.status === "APPROVED"
                                    ? "vacation"
                                    : "pending"
                                  : home
                                    ? "home"
                                    : "office";
                              return (
                                <td
                                  key={d}
                                  data-today={d === data.today}
                                  data-day={`${["Po", "Út", "St", "Čt", "Pá"][dashboardDays.indexOf(d)]} · ${dayText(d)}`}
                                >
                                  <div className={s.weekCell} data-mode={mode}>
                                    <strong>
                                      {mode === "off"
                                        ? "Volný den"
                                        : mode === "vacation"
                                          ? vacation?.vacation_part && leaves.filter((r) => r.kind === "VACATION").length === 1 ? "Dovolená · půlden" : "Dovolená"
                                          : mode === "pending"
                                            ? "Dovolená · čeká"
                                            : home
                                              ? "Home office"
                                              : "Kancelář"}
                                    </strong>
                                    {leaves.filter((r) => r.kind === "VACATION" && r.vacation_part).map((r) => (
                                      <small key={r.id}>{vacationLabel(r)} · {r.time_from?.slice(0, 5)}–{r.time_to?.slice(0, 5)}{r.status === "PENDING" ? " · čeká" : ""}</small>
                                    ))}
                                    {vacation?.vacation_part && leaves.filter((r) => r.kind === "VACATION").length === 1 && <small>Zbytek dne: {home ? "home office" : "kancelář"}</small>}
                                    {personal.map((r) => (
                                      <small key={r.id}>
                                        Osobní volno
                                        <br />
                                        {!(
                                          hiddenWorklog && r.source_absence_id
                                        ) && (
                                          <>
                                            {r.time_from?.slice(0, 5)}–
                                            {r.time_to?.slice(0, 5)}
                                          </>
                                        )}
                                      </small>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div
                  className={s.sectionHeader}
                  style={{ marginTop: 16, marginBottom: 0 }}
                >
                  <small className={s.muted}>
                    Bez nahlášeného home office či volna se zobrazuje kancelář.
                    Čekající dovolená zatím není schválená.
                  </small>
                  <button
                    className={ui.secondary}
                    onClick={() =>
                      open({ kind: "PLAN", label: "Nahlásit home office" })
                    }
                  >
                    Můj plán na příští týden
                  </button>
                </div>
              </section>
            )}
            {team &&
              weekOffset === 0 &&
              year === Number(data.today.slice(0, 4)) && (
                <section className={s.section}>
                  <div className={s.sectionHeader}>
                    <div>
                      <h2>Kdo je dnes přihlášený</h2>
                      <p className={s.muted}>
                        Kliknutím otevřete příchody a odchody zaměstnance.
                      </p>
                    </div>
                  </div>
                  <div className={s.balanceGrid}>
                    {data.people
                      .filter((p) => selected(p.username))
                      .map((p) => {
                        const current = data.sessions.find(
                          (z) =>
                            z.username === p.username &&
                            z.day === data.today &&
                            !z.ended_at,
                        );
                        const last = data.sessions.find(
                          (z) =>
                            z.username === p.username && z.day === data.today,
                        );
                        const home = data.home_days.some(
                          (h) =>
                            h.username === p.username && h.day === data.today,
                        );
                        const vacation = data.requests.some(
                          (r) =>
                            r.username === p.username &&
                            r.kind === "VACATION" &&
                            vacationNow(r) &&
                            r.status === "APPROVED" &&
                            r.date_from <= data.today &&
                            r.date_to >= data.today,
                        );
                        const unclosed = data.sessions.some(
                          (z) =>
                            z.username === p.username &&
                            z.day < data.today &&
                            !z.ended_at,
                        );
                        return (
                          <button
                            className={s.balance}
                            key={p.username}
                            onClick={() => {
                              setPerson(p.username);
                              selectTab("sessions");
                            }}
                          >
                            <h3>{p.display_name}</h3>
                            <p>
                              {current ? (
                                <>
                                  <i className={s.liveDot} />
                                  Přihlášeno od {timeText(current.started_at)}
                                </>
                              ) : vacation ? (
                                "Dovolená"
                              ) : home ? (
                                last?.ended_at ? (
                                  `Odhlášeno od ${timeText(last.ended_at)}`
                                ) : (
                                  "Home office · bez příchodu"
                                )
                              ) : (
                                "Kancelář"
                              )}
                            </p>
                            <small>{p.daily_hours} hodin denně</small>
                            {unclosed && (
                              <p className={ui.late}>
                                Chybí dřívější odhlášení
                              </p>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </section>
              )}
            <section className={s.section}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>{team ? "Dovolená v týmu" : "Moje dovolená"}</h2>
                  <p className={s.muted}>
                    Roční nárok 20 pracovních dnů. Víkendy a české svátky se
                    neodečítají.
                  </p>
                </div>
                {!team && (
                  <button
                    className={ui.secondary}
                    onClick={() =>
                      open({ kind: "VACATION", label: "Žádost o dovolenou" })
                    }
                  >
                    Požádat o dovolenou
                  </button>
                )}
              </div>
              <div className={s.balanceGrid}>
                {data.balances
                  .filter((b) => selected(b.username))
                  .map((b) => (
                    <div className={s.balance} key={b.username}>
                      <h3>{name(b.username)}</h3>
                      <strong>{vacationDays(b.remaining_minutes, b.username)}</strong>{" "}
                      <span className={s.muted}>
                        zbývá z {vacationDays(b.entitlement_minutes, b.username)}
                      </span>
                      <p>
                        {daysText(b.approved)} schváleno
                        · {daysText(b.pending)} čeká
                        <br />
                        Za absence odečteno {vacationDays(b.deducted_minutes, b.username)}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
            {!team && year === Number(data.today.slice(0, 4)) && (
              <section className={s.section}>
                <div className={s.sectionHeader}>
                  <div>
                    <h2>Home office · příští týden</h2>
                    <p className={s.muted}>
                      {dayText(nextWeek)} – {dayText(addDays(nextWeek, 4))} ·
                      plán můžete kdykoliv změnit
                    </p>
                  </div>
                  <button
                    className={ui.primary}
                    onClick={() =>
                      open({ kind: "PLAN", label: "Nahlásit home office" })
                    }
                  >
                    Můj plán
                  </button>
                </div>
                {team ? (
                  data.people
                    .filter((p) => selected(p.username))
                    .map((p) => (
                      <div key={p.username} style={{ marginBottom: 16 }}>
                        <p className={s.sessionName}>
                          <Avatar name={p.display_name} />
                          <strong>{p.display_name}</strong>
                          <span className={s.range}>
                            {p.daily_hours} h denně
                          </span>
                        </p>
                        <div className={s.week}>
                          {weekDays.map((d, i) => (
                            <div
                              key={d}
                              className={s.day}
                              data-home={data.home_days.some(
                                (h) => h.username === p.username && h.day === d,
                              )}
                            >
                              <strong>
                                {["Po", "Út", "St", "Čt", "Pá"][i]}
                              </strong>
                              <small>
                                {d.slice(8)}. {Number(d.slice(5, 7))}.
                              </small>
                              <span>
                                {data.home_days.some(
                                  (h) =>
                                    h.username === p.username && h.day === d,
                                )
                                  ? "Home office"
                                  : businessDay(d)
                                    ? "Kancelář"
                                    : "Volný den"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className={s.week}>
                    {weekDays.map((d, i) => (
                      <div
                        key={d}
                        className={s.day}
                        data-home={data.home_days.some(
                          (h) => h.username === me.username && h.day === d,
                        )}
                      >
                        <strong>
                          {
                            ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"][
                              i
                            ]
                          }
                        </strong>
                        <small>
                          {d.slice(8)}. {Number(d.slice(5, 7))}.
                        </small>
                        <span>
                          {data.home_days.some(
                            (h) => h.username === me.username && h.day === d,
                          )
                            ? "Home office"
                            : businessDay(d)
                              ? "Kancelář"
                              : "Volný den"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            <section className={s.section}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Osobní volno</h2>
                  {(data.personal_totals ?? [])
                    .filter((p) => selected(p.username))
                    .map((p) => (
                      <p className={s.muted} key={p.username}>
                        {name(p.username)} · {year}:{" "}
                        <strong>{minutesText(p.minutes)}</strong> · upozornění
                        nad {hoursText(p.threshold_minutes)} h
                      </p>
                    ))}
                  <p className={s.muted}>
                    Bez limitu a bez schvalování. Každý odchod na osobní volno
                    je nutné zaznamenat včetně času od–do.
                  </p>
                </div>
                <button
                  className={ui.secondary}
                  onClick={() =>
                    open({ kind: "PERSONAL", label: "Zaznamenat osobní volno" })
                  }
                >
                  + Zaznamenat
                </button>
              </div>
            </section>
          </>
        )}
        {(tab === "requests" || tab === "approvals") && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <h2>
                {tab === "approvals"
                  ? "Žádosti o dovolenou ke schválení"
                  : "Dovolená a osobní volno"}
              </h2>
              <div className={s.actions}>
                <button
                  className={ui.secondary}
                  onClick={() =>
                    open({ kind: "PERSONAL", label: "Zaznamenat osobní volno" })
                  }
                >
                  + Osobní volno
                </button>
                <button
                  className={ui.primary}
                  onClick={() =>
                    open({ kind: "VACATION", label: "Žádost o dovolenou" })
                  }
                >
                  + Dovolená
                </button>
              </div>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Zaměstnanec / typ</th>
                    <th>Termín</th>
                    <th>Stav</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === "approvals" ? pending : requests)
                    .slice(0, limit)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{name(r.username)}</strong>
                          <small>
                            {r.kind === "VACATION"
                              ? vacationLabel(r)
                              : "Osobní volno"}
                          </small>
                          <small>Zapsáno {stamp(r.created_at)}</small>
                        </td>
                        <td>
                          {dayText(r.date_from)}
                          {r.date_to !== r.date_from
                            ? ` – ${dayText(r.date_to)}`
                            : ""}
                          <small>
                            {r.kind === "PERSONAL"
                              ? hiddenWorklog && r.source_absence_id
                                ? "Ze schválené omluvenky"
                                : `${r.time_from?.slice(0, 5)}–${r.time_to?.slice(0, 5)}`
                              : `${daysText(r.days)}${r.vacation_part ? ` · ${r.time_from?.slice(0, 5)}–${r.time_to?.slice(0, 5)}` : ""}`}
                          </small>
                          {r.note && <small>{r.note}</small>}
                        </td>
                        <td>
                          <span className={s.pill} data-status={r.status}>
                            {r.kind === "PERSONAL" && r.status === "APPROVED"
                              ? "Zaznamenáno"
                              : LEAVE_STATUS[r.status]}
                          </span>
                          {r.review_note && <small>{r.review_note}</small>}
                        </td>
                        <td>
                          <div className={s.tableActions}>
                            {owner &&
                              r.status === "PENDING" &&
                              r.username !== me.username && (
                                <>
                                  <button
                                    className={ui.primary}
                                    disabled={busy}
                                    onClick={() => requestAction(r, "APPROVED")}
                                  >
                                    Schválit
                                  </button>
                                  <button
                                    className={ui.secondary}
                                    onClick={() => requestAction(r, "REJECTED")}
                                  >
                                    Zamítnout
                                  </button>
                                </>
                              )}
                            {owner &&
                              r.status === "PENDING" &&
                              r.username === me.username && (
                                <small>{me.username === "VIKTOR" ? "Vlastní žádost musí schválit Milan" : "Schvaluje Viktor"}</small>
                              )}
                            {r.source_absence_id && (
                              <small>Ze schválené omluvenky</small>
                            )}
                            {!r.source_absence_id &&
                              (r.username === me.username || owner) &&
                              ["PENDING", "APPROVED"].includes(r.status) &&
                              (r.status === "PENDING" ||
                                r.kind === "PERSONAL" ||
                                r.date_from > data.today) && (
                                <button
                                  className={ui.quiet}
                                  onClick={() =>
                                    open({
                                      kind: "cancel_request",
                                      id: r.id,
                                      label: "Zrušit volno",
                                    })
                                  }
                                >
                                  Zrušit
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!(tab === "approvals" ? pending : requests).length && (
              <p className={s.empty}>
                V tomto pohledu nejsou žádné žádosti ani záznamy.
              </p>
            )}
          </section>
        )}
        {!hiddenWorklog && tab === "sessions" && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <div>
                <h2>Příchody a odchody od PC</h2>
                <p className={s.muted}>
                  Každý řádek představuje jeden potvrzený pracovní úsek. Zavření
                  prohlížeče nezaznamená odchod.
                </p>
              </div>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Člověk / den</th>
                    <th>Příchod</th>
                    <th>Odchod</th>
                    <th>Délka úseku</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, limit).map((z) => (
                    <tr key={z.id}>
                      <td>
                        <strong>{name(z.username)}</strong>
                        <small>{dayText(z.day)}</small>
                      </td>
                      <td>{timeText(z.started_at)}</td>
                      <td>
                        {z.ended_at ? (
                          timeText(z.ended_at)
                        ) : z.day === data.today ? (
                          <span className={s.pill}>
                            <i className={s.liveDot} />
                            Přihlášeno
                          </span>
                        ) : (
                          <span className={ui.late}>Chybí odhlášení</span>
                        )}
                      </td>
                      <td>
                        {!z.ended_at && z.day < data.today
                          ? "Neuzavřený záznam"
                          : minutesText(
                              Math.max(
                                0,
                                (Date.parse(z.ended_at || data.server_now) -
                                  Date.parse(z.started_at)) /
                                  60000,
                              ),
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!sessions.length && (
              <p className={s.empty}>
                Zatím nejsou zaznamenané příchody a odchody.
              </p>
            )}
          </section>
        )}
        {tab === "absences" && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <div>
                <h2>
                  {team
                    ? "Absence zaměstnanců"
                    : hiddenWorklog
                      ? "Žádosti o omluvenku"
                      : "Moje absence a omluvenky"}
                </h2>
                <p className={s.muted}>
                  {hiddenWorklog
                    ? "Zde můžete odpovědět na žádost majitele o omluvenku."
                    : "Mezery v přihlášení během pracovní doby od 8:30. Dovolená a zaznamenané osobní volno se odečítají."}
                </p>
              </div>
              <select
                className={ui.select}
                aria-label="Stav absence"
                value={absenceFilter}
                onChange={(e) => setAbsenceFilter(e.target.value)}
              >
                <option value="open">K vyřešení</option>
                <option value="excused">Omluvené</option>
                <option value="all">Všechny</option>
              </select>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Člověk / den</th>
                    {!hiddenWorklog && <th>Absence</th>}
                    <th>Stav a vysvětlení</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAbsences.slice(0, limit).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{name(a.username)}</strong>
                        <small>{dayText(a.day)}</small>
                      </td>
                      {!hiddenWorklog && (
                        <td className={ui.late}>{minutesText(a.minutes)}</td>
                      )}
                      <td>
                        <span className={s.pill} data-status={a.status}>
                          {a.deducted_minutes > 0
                            ? "Odečteno z dovolené"
                            : a.excused_minutes > 0
                              ? "Převedeno na osobní volno"
                              : ABSENCE_STATUS[a.status]}
                        </span>
                        {a.request_note && (
                          <small>Výzva: {a.request_note}</small>
                        )}
                        {a.explanation && (
                          <small>Omluvenka: {a.explanation}</small>
                        )}
                        {a.review_note && (
                          <small>Vyřízení: {a.review_note}</small>
                        )}
                      </td>
                      <td>
                        <div className={s.tableActions}>
                          {a.username === me.username &&
                            a.status !== "EXCUSED" && (
                              <button
                                className={ui.primary}
                                onClick={() =>
                                  absenceAction(a, "submit_excuse")
                                }
                              >
                                Doplnit omluvenku
                              </button>
                            )}
                          {owner && a.username !== me.username && (
                            <>
                              {!["EXCUSED", "SUBMITTED"].includes(a.status) && (
                                <button
                                  className={ui.secondary}
                                  onClick={() =>
                                    absenceAction(a, "grant_personal")
                                  }
                                >
                                  Převést na osobní volno
                                </button>
                              )}
                              {a.status !== "EXCUSED" && (
                                <button
                                  className={ui.secondary}
                                  onClick={() =>
                                    absenceAction(a, "deduct_vacation")
                                  }
                                >
                                  Odečíst z dovolené
                                </button>
                              )}
                              {a.deducted_minutes > 0 && (
                                <button
                                  className={ui.quiet}
                                  onClick={() =>
                                    absenceAction(a, "reverse_deduction")
                                  }
                                >
                                  Vrátit odečet
                                </button>
                              )}
                              {a.excused_minutes > 0 && (
                                <button
                                  className={ui.quiet}
                                  onClick={() =>
                                    absenceAction(a, "reverse_excuse")
                                  }
                                >
                                  Vrátit schválení
                                </button>
                              )}
                              {!["EXCUSED", "SUBMITTED"].includes(a.status) && (
                                <button
                                  className={ui.secondary}
                                  onClick={() => absenceAction(a, "ask_excuse")}
                                >
                                  Vyžádat omluvenku
                                </button>
                              )}
                              {a.status === "SUBMITTED" && (
                                <>
                                  <button
                                    className={ui.primary}
                                    onClick={() =>
                                      absenceAction(
                                        a,
                                        "review_excuse",
                                        "EXCUSED",
                                      )
                                    }
                                  >
                                    Schválit jako osobní volno
                                  </button>
                                  <button
                                    className={ui.secondary}
                                    onClick={() =>
                                      absenceAction(
                                        a,
                                        "review_excuse",
                                        "REJECTED",
                                      )
                                    }
                                  >
                                    Zamítnout
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredAbsences.length && (
              <p className={s.empty}>Žádné absence v tomto pohledu.</p>
            )}
          </section>
        )}
        {!hiddenWorklog && tab === "history" && (
          <section className={s.section}>
            <div className={s.sectionHeader}>
              <h2>Historie změn</h2>
              <span className={s.muted}>Posledních 100 událostí</span>
            </div>
            {data.events
              .filter((e) => selected(e.username))
              .map((e) => (
                <article className={s.timeline} key={e.id}>
                  <strong>{EVENT_NAMES[e.action] || e.action}</strong>
                  <p>
                    {name(e.actor)} · týká se {name(e.username)}
                  </p>
                  <time>{stamp(e.created_at)}</time>
                </article>
              ))}
          </section>
        )}
        {((tab === "sessions" && sessions.length > limit) ||
          (tab === "requests" && requests.length > limit) ||
          (tab === "absences" && filteredAbsences.length > limit)) && (
          <button
            className={ui.secondary}
            onClick={() => setLimit((n) => n + 100)}
          >
            Načíst další
          </button>
        )}
        <footer className={ui.bottomNote}>
          <span>
            Docházka podle času serveru · automatická aktualizace každých 30 s
          </span>
          <span>Karina a Vendula 7 h · ostatní 9 h</span>
        </footer>
      </main>
      {toast && (
        <div className={ui.toast} role="status">
          {toast}
        </div>
      )}
      {editor && (
        <Modal title={editor.label} onClose={() => setEditor(null)} busy={busy}>
          <form className={ui.form} onSubmit={submit}>
            {formError && (
              <p className={ui.formError} role="alert">
                {formError}
              </p>
            )}
            <fieldset disabled={busy}>
              {editor.onBehalf && (
                <>
                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>Kolega</span>
                    <select className={ui.input} required value={targetUsername} disabled={planLoading}
                      onChange={(e) => {
                        setTargetUsername(e.target.value);
                        setTimeTo(workEndFor(e.target.value));
                        setRemainingDays("");
                        setFormError("");
                        if (editor.kind === "PLAN") void loadPlan(from, e.target.value);
                      }}>
                      {data.people.filter((p) => p.username !== me.username).map((p) => (
                        <option key={p.username} value={p.username}>{p.display_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>Co chcete nastavit</span>
                    <select className={ui.input} value={editor.kind} disabled={planLoading}
                      onChange={(e) => {
                        setEditor({ ...editor, kind: e.target.value });
                        setFormError("");
                        if (e.target.value === "PLAN") void loadPlan(from, targetUsername);
                      }}>
                      <option value="VACATION">Termín dovolené</option>
                      <option value="PLAN">Home office</option>
                      <option value="PERSONAL">Osobní volno</option>
                      <option value="BALANCE">Zůstatek dovolené</option>
                    </select>
                  </label>
                </>
              )}
              {editor.kind === "BALANCE" && (
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Zbývající dovolená pro rok {year} (dny)</span>
                  <input className={ui.input} type="number" min="0" max="366" step="0.5"
                    required value={remainingDays} onChange={(e) => setRemainingDays(e.target.value)} />
                  <small>Zadejte nový dostupný zůstatek po odečtení již rezervovaných žádostí. Další dovolená se bude odečítat z této hodnoty.</small>
                </label>
              )}
              {editor.kind === "deduct_vacation" && (
                <p className={s.formIntro}>
                  Z dovolené za rok{" "}
                  {data.absences
                    .find((a) => a.id === editor.id)
                    ?.day.slice(0, 4)}{" "}
                  se odečte <strong>{vacationDays(editor.minutes ?? 0, data.absences.find((a) => a.id === editor.id)?.username ?? me.username)}</strong>.
                  Roční nárok je 20 dnů. Odečet
                  zahrne pouze absenci a je možný po skončení pracovní doby
                  daného dne.
                </p>
              )}
              {(editor.kind === "grant_personal" ||
                (editor.kind === "review_excuse" &&
                  editor.decision === "EXCUSED")) && (
                <p className={s.formIntro}>
                  Schválením se {minutesText(editor.minutes ?? 0)} nepokrytého
                  času zaznamená jako osobní volno s konkrétními časy od–do.
                  Přičte se do ročního součtu osobního volna. Převod je možný po
                  skončení pracovní doby daného dne.
                </p>
              )}
              {editor.kind === "reverse_deduction" && (
                <p className={s.formIntro}>
                  Odečtená dovolená se vrátí do zůstatku za původní rok a
                  omluvenka se znovu otevře k vyřízení.
                </p>
              )}
              {editor.kind === "reverse_excuse" && (
                <p className={s.formIntro}>
                  Osobní volno vzniklé z této omluvenky se zruší, roční součet
                  se přepočítá a omluvenka se znovu otevře.
                </p>
              )}
              {(editor.kind === "VACATION" || editor.kind === "PERSONAL") && (
                <>
                  {editor.kind === "VACATION" && (
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>Délka dovolené</span>
                      <select className={ui.input} value={vacationPart} onChange={(e) => setVacationPart(e.target.value)}>
                        <option value="FULL">Celý den / více dní</option>
                        <option value="AM">Půl dne – dopoledne</option>
                        <option value="PM">Půl dne – odpoledne</option>
                      </select>
                      {vacationPart !== "FULL" && <small>Ze zůstatku se odečte 0,5 dne. Čas odpovídá první nebo druhé polovině {editor.onBehalf ? "pracovní doby kolegy" : "vaší pracovní doby"}.</small>}
                    </label>
                  )}
                  <p className={s.formIntro}>
                    {editor.kind === "VACATION"
                      ? editor.onBehalf
                        ? "Dovolená kolegy bude rovnou schválená Viktorem a odečte se z jeho zůstatku."
                        : "Dovolenou schvaluje Viktor. Čekající žádost rezervuje dny z ročního nároku 20 dnů."
                      : "Osobní volno nemá limit ani schvalování. Zapište den a přesný čas od–do."}
                  </p>
                  <div className={ui.formRow}>
                    <label className={ui.field}>
                      <span className={ui.fieldLabel}>
                        {editor.kind === "PERSONAL" || vacationPart !== "FULL" ? "Den" : "Od"}
                      </span>
                      <input
                        className={ui.input}
                        type="date"
                        value={from}
                        required
                        onChange={(e) => {
                          setFrom(e.target.value);
                          if (to < e.target.value) setTo(e.target.value);
                        }}
                      />
                    </label>
                    {editor.kind === "VACATION" && vacationPart === "FULL" && (
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>Do (včetně)</span>
                        <input
                          className={ui.input}
                          type="date"
                          min={from}
                          value={to}
                          required
                          onChange={(e) => setTo(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                  {editor.kind === "PERSONAL" && (
                    <div className={ui.formRow}>
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>Od</span>
                        <input
                          className={ui.input}
                          type="time"
                          required
                          value={timeFrom}
                          onChange={(e) => setTimeFrom(e.target.value)}
                        />
                      </label>
                      <label className={ui.field}>
                        <span className={ui.fieldLabel}>Do</span>
                        <input
                          className={ui.input}
                          type="time"
                          required
                          value={timeTo}
                          onChange={(e) => setTimeTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
              {editor.kind === "PLAN" ? (
                <>
                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>Vyberte datum v týdnu</span>
                    <input
                      className={ui.input}
                      type="date"
                      required
                      value={from}
                      disabled={planLoading}
                      onChange={(e) => void loadPlan(e.target.value)}
                    />
                  </label>
                  <p className={s.formIntro}>
                    {dayText(planWeek)} – {dayText(addDays(planWeek, 4))}
                  </p>
                  {planWeekDays.map((d, i) => {
                    const vacation = data.requests.some(
                      (r) =>
                        r.username === editorUsername &&
                        r.kind === "VACATION" &&
                        !r.vacation_part &&
                        ["PENDING", "APPROVED"].includes(r.status) &&
                        r.date_from <= d &&
                        r.date_to >= d,
                    );
                    return (
                      <label className={s.planDay} key={d}>
                        <input
                          type="checkbox"
                          checked={planDays.includes(d)}
                          disabled={!businessDay(d) || vacation || planLoading}
                          onChange={(e) =>
                            setPlanDays(
                              e.target.checked
                                ? [...planDays, d]
                                : planDays.filter((x) => x !== d),
                            )
                          }
                        />
                        {["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"][i]}{" "}
                        · {dayText(d)}
                        <small>
                          {vacation
                            ? "Dovolená"
                            : !businessDay(d)
                              ? "Volný den"
                              : ""}
                        </small>
                      </label>
                    );
                  })}
                  <p className={s.muted}>
                    Vybráno {planDays.length} dní. Nevybrané pracovní dny
                    zůstávají kancelář.
                  </p>
                </>
              ) : editor.kind === "cancel_request" ? (
                <p className={s.formIntro}>
                  Opravdu chcete toto volno zrušit? Změna se uloží do historie a
                  přepočítá zůstatek i případnou absenci.
                </p>
              ) : (
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>
                    {editor.kind === "submit_excuse"
                      ? "Omluvenka"
                      : editor.kind === "VACATION" || editor.kind === "PERSONAL"
                        ? "Poznámka (volitelná)"
                        : "Poznámka / důvod"}
                  </span>
                  <textarea
                    className={ui.textarea}
                    maxLength={3000}
                    required={
                      editor.kind === "submit_excuse" ||
                      editor.kind === "reverse_deduction" ||
                      editor.kind === "reverse_excuse" ||
                      editor.decision === "REJECTED"
                    }
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              )}
              <footer className={ui.formFooter}>
                <button
                  className={ui.quiet}
                  type="button"
                  onClick={() => setEditor(null)}
                >
                  Zrušit
                </button>
                <button
                  className={ui.primary}
                  type="submit"
                  disabled={
                    planLoading || (editor.kind === "PLAN" && !!formError)
                  }
                >
                  {busy
                    ? "Ukládání…"
                    : editor.kind === "VACATION"
                      ? editor.onBehalf ? "Uložit schválenou dovolenou" : "Odeslat žádost"
                      : editor.kind === "PERSONAL"
                        ? "Zaznamenat volno"
                        : "Potvrdit"}
                </button>
              </footer>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
