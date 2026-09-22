export type AttendancePerson = {
  username: string;
  display_name: string;
  role: "OWNER" | "EMPLOYEE";
  daily_hours: number;
};
export type LeaveRequest = {
  vacation_part?: "AM" | "PM" | null;
  source_absence_id?: string | null;
  id: string;
  username: string;
  kind: "VACATION" | "PERSONAL";
  date_from: string;
  date_to: string;
  time_from: string | null;
  time_to: string | null;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  created_at: string;
  reviewer: string | null;
  review_note: string | null;
  days: number;
};
export type Absence = {
  deducted_minutes: number;
  excused_minutes: number;
  id: string;
  username: string;
  day: string;
  minutes: number;
  status: "OPEN" | "REQUESTED" | "SUBMITTED" | "EXCUSED" | "REJECTED";
  request_note: string | null;
  explanation: string | null;
  review_note: string | null;
  submitted_at: string | null;
};
export type WorkSession = {
  id: string;
  username: string;
  day: string;
  started_at: string;
  ended_at: string | null;
};
export type AttendanceData = {
  after_hours?: {
    is_working: boolean;
    can_view_reports: boolean;
    sessions: (WorkSession & { display_name: string; minutes: number })[];
  };
  worklog_hidden?: boolean;
  is_working?: boolean;
  daily_work?: {
    username: string;
    day: string;
    target_minutes: number;
    worked_minutes: number;
    missing_minutes: number;
    absence_id: string | null;
    unclosed: boolean;
    final: boolean;
  }[];
  server_now: string;
  today: string;
  user: AttendancePerson;
  rules: {
    vacation_days: number;
    home_limit: number | null;
    work_start: string;
    work_end: string;
    personal_approval: boolean;
  };
  people: AttendancePerson[];
  balances: {
    username: string;
    approved: number;
    pending: number;
    daily_hours: number;
    entitlement_minutes: number;
    remaining_minutes: number;
    deducted_minutes: number;
  }[];
  personal_totals: {
    username: string;
    display_name?: string;
    minutes: number;
    threshold_minutes: number;
    year: number;
  }[];
  requests: LeaveRequest[];
  week_requests: LeaveRequest[];
  week_home_days: { username: string; day: string }[];
  home_days: { username: string; day: string; created_at: string }[];
  checkins: { username: string; day: string; checked_in_at: string }[];
  sessions: WorkSession[];
  absences: Absence[];
  events: {
    id: number;
    actor: string;
    username: string;
    action: string;
    created_at: string;
    details: Record<string, unknown>;
  }[];
};
export const dayText = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Prague",
  });
export const timeText = (iso: string) =>
  new Date(iso).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Prague",
  });
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
export const minutesText = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${Math.floor(minutes % 60)} min`;
export const hoursText = (minutes: number) =>
  (minutes / 60).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
export const addDays = (day: string, days: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const monday = (day: string) =>
  addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
export function businessDay(day: string) {
  const d = new Date(day + "T12:00:00Z"),
    y = d.getUTCFullYear();
  if (
    d.getUTCDay() === 0 ||
    d.getUTCDay() === 6 ||
    [
      "01-01",
      "05-01",
      "05-08",
      "07-05",
      "07-06",
      "09-28",
      "10-28",
      "11-17",
      "12-24",
      "12-25",
      "12-26",
    ].includes(day.slice(5))
  )
    return false;
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    h =
      (19 * a +
        b -
        Math.floor(b / 4) -
        Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) +
        15) %
      30,
    l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    date = ((h + l - 7 * m + 114) % 31) + 1,
    easter = `${y}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  return day !== addDays(easter, -2) && day !== addDays(easter, 1);
}
export function daysText(days: number) {
  const value = Math.round(days * 1000) / 1000;
  const unit = !Number.isInteger(value) ? "dne" : value === 1 ? "den" : value >= 2 && value <= 4 ? "dny" : "dnů";
  return `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} ${unit}`;
}
export function vacationLabel(request: LeaveRequest) {
  return request.vacation_part === "AM" ? "½ dne · dopoledne" : request.vacation_part === "PM" ? "½ dne · odpoledne" : "Dovolená";
}
export const LEAVE_STATUS = {
  PENDING: "Čeká na schválení",
  APPROVED: "Schváleno",
  REJECTED: "Zamítnuto",
  CANCELLED: "Zrušeno",
};
export const ABSENCE_STATUS = {
  OPEN: "Bez omluvenky",
  REQUESTED: "Vyžádána omluvenka",
  SUBMITTED: "Čeká na vyřízení",
  EXCUSED: "Omluveno",
  REJECTED: "Neomluveno",
};
export const EVENT_NAMES: Record<string, string> = {
  set_vacation_balance: "Nastaven zůstatek dovolené",
  request: "Záznam / žádost o volno",
  review_request: "Rozhodnutí o dovolené",
  cancel_request: "Zrušení volna",
  home_plan: "Nahlášení home office",
  checkin: "Příchod k PC",
  checkout: "Odchod od PC",
  ask_excuse: "Vyžádání omluvenky",
  submit_excuse: "Dodání omluvenky",
  review_excuse: "Rozhodnutí o omluvence",
  deduct_vacation: "Absence odečtena z dovolené",
  reverse_deduction: "Vrácení odečtu dovolené",
  reverse_excuse: "Vrácení schválení omluvenky",
  grant_personal: "Absence převedena na osobní volno majitelem",
};
