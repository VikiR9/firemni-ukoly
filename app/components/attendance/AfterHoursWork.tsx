import { minutesText, stamp, type AttendanceData } from "@/lib/attendance";
import ui from "../tasks/Workspace.module.css";
import s from "./Attendance.module.css";

type AfterHoursSession = NonNullable<AttendanceData["after_hours"]>["sessions"][number];

export function AfterHoursControl({ working, regularWorking, busy, onToggle }: {
  working: boolean;
  regularWorking: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <section className={s.presence} data-online={working} aria-label="Práce mimo pracovní dobu">
      <div>
        <span className={ui.eyebrow} role="status">
          {working && <i className={s.liveDot} />}
          {working ? "ONLINE · PRÁCE MIMO PRACOVNÍ DOBU" : "OFFLINE · SAMOSTATNÁ EVIDENCE"}
        </span>
        <h2>Práce mimo pracovní dobu</h2>
        <p>Začátek a konec potvrďte tlačítkem. Tato práce se eviduje odděleně od běžné docházky. Přehled časů vidí pouze Viktor.</p>
        {regularWorking && !working && <p>Nejprve ukončete běžnou práci na home office v Mojí docházce.</p>}
      </div>
      <div className={s.presenceActions}>
        <button
          className={working ? ui.secondary : ui.primary}
          disabled={busy || (regularWorking && !working)}
          aria-pressed={working}
          onClick={onToggle}
        >
          {busy ? "Ukládání…" : working ? "Ukončit práci mimo pracovní dobu" : "Začít práci mimo pracovní dobu"}
        </button>
      </div>
    </section>
  );
}

export function AfterHoursReport({ sessions, year }: { sessions: AfterHoursSession[]; year: number }) {
  const totals = new Map<string, { name: string; minutes: number; active: boolean }>();
  for (const session of sessions) {
    const total = totals.get(session.username) ?? { name: session.display_name, minutes: 0, active: false };
    total.minutes += session.minutes;
    total.active ||= !session.ended_at;
    totals.set(session.username, total);
  }
  return (
    <section className={s.section} aria-label="Výstupy práce mimo pracovní dobu">
      <div className={`${s.sectionHeader} ${s.afterHoursHeader}`}>
        <div>
          <h2>Práce mimo pracovní dobu · {year}</h2>
          <p className={s.muted}>Pouze pro Viktora. Časy jsou samostatné a nezapočítávají se do běžné docházky ani omlouvání absencí. Součty zahrnují jen část úseků ve vybraném roce; probíhající úseky se průběžně obnovují.</p>
        </div>
        <strong>{minutesText(sessions.reduce((sum, session) => sum + session.minutes, 0))}</strong>
      </div>
      {sessions.length ? <>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption className={s.muted}>Součet podle zaměstnance</caption>
            <thead><tr><th>Zaměstnanec</th><th>Celkem</th><th>Stav</th></tr></thead>
            <tbody>{Array.from(totals, ([username, total]) => <tr key={username}>
              <td>{total.name}</td><td>{minutesText(total.minutes)}</td><td>{total.active ? "Online" : "Offline"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption className={s.muted}>Jednotlivé pracovní úseky</caption>
            <thead><tr><th>Zaměstnanec</th><th>Začátek</th><th>Konec</th><th>Délka v roce {year}</th></tr></thead>
            <tbody>{sessions.map((session) => <tr key={session.id}>
              <td>{session.display_name}</td><td>{stamp(session.started_at)}</td>
              <td>{session.ended_at ? stamp(session.ended_at) : "Probíhá · online"}</td>
              <td>{minutesText(session.minutes)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : <p className={s.empty}>Pro vybraný rok a zaměstnance zatím nejsou žádné záznamy.</p>}
    </section>
  );
}
