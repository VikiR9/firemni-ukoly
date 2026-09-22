import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { gatewaySecret, sessionUser } from "@/lib/server-session";
const actions = new Set([
  "snapshot",
  "request",
  "review_request",
  "cancel_request",
  "home_plan",
  "checkin",
  "checkout",
  "after_hours_start",
  "after_hours_stop",
  "ask_excuse",
  "submit_excuse",
  "review_excuse",
  "deduct_vacation",
  "reverse_deduction",
  "reverse_excuse",
  "grant_personal",
  "set_vacation_balance",
]);
async function handle(
  req: NextRequest,
  action: string,
  data: Record<string, unknown>,
) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json(
      { error: "Pro docházku se prosím znovu přihlaste." },
      { status: 401 },
    );
  if (!actions.has(action))
    return NextResponse.json({ error: "Neplatná akce." }, { status: 400 });
  if (
    (data.target_username != null && data.target_username !== user.username) ||
    action === "set_vacation_balance"
  ) {
    if (user.username !== "VIKTOR" || user.role !== "OWNER")
      return NextResponse.json(
        { error: "Volno kolegům nastavuje pouze Viktor." },
        { status: 403 },
      );
    if (!["request", "home_plan", "set_vacation_balance"].includes(action) ||
        typeof data.target_username !== "string" || !data.target_username.trim())
      return NextResponse.json({ error: "Vyberte kolegu a platnou akci." }, { status: 400 });
  }
  if (data.team === true && user.role !== "OWNER")
    return NextResponse.json(
      { error: "Přehled je dostupný pouze majiteli." },
      { status: 403 },
    );
  try {
    const { data: result, error } = await supabase.rpc("attendance_gateway", {
      p_secret: gatewaySecret(),
      p_actor: user.username,
      p_action: action,
      p_data: data,
    });
    if (error)
      return NextResponse.json(
        {
          error: /fetch|network/i.test(error.message)
            ? "Databáze není dostupná. Zkuste to znovu."
            : error.message,
        },
        { status: 400 },
      );
    if (result?.after_hours && (user.username !== "VIKTOR" || user.role !== "OWNER")) {
      result.after_hours = {
        is_working: result.after_hours.is_working === true,
        can_view_reports: false,
        sessions: [],
      };
    }
    if (
      result?.server_now &&
      user.role !== "OWNER" &&
      ["KARINA", "VENDULA"].includes(user.username)
    ) {
      result.worklog_hidden = true;
      result.is_working = result.sessions.some(
        (s: { day: string; ended_at: string | null }) =>
          s.day === result.today && !s.ended_at,
      );
      result.sessions = [];
      result.checkins = [];
      result.events = [];
      result.daily_work = [];
      result.absences = result.absences
        .filter((a: { status: string }) =>
          ["REQUESTED", "SUBMITTED", "REJECTED"].includes(a.status),
        )
        .map((a: Record<string, unknown>) => ({
          id: a.id,
          username: a.username,
          day: a.day,
          status: a.status,
          request_note: a.request_note,
          explanation: a.explanation,
          review_note: a.review_note,
        }));
      for (const key of ["requests", "week_requests"])
        result[key] = result[key].map((r: Record<string, unknown>) =>
          r.source_absence_id ? { ...r, time_from: null, time_to: null } : r,
        );
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Docházka není dostupná. Zkontrolujte konfiguraci serveru." },
      { status: 503 },
    );
  }
}
export async function GET(req: NextRequest) {
  return handle(req, "snapshot", {
    team: req.nextUrl.searchParams.get("team") === "true",
    year: Number(req.nextUrl.searchParams.get("year")) || undefined,
  });
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Neplatný původ požadavku." },
      { status: 403 },
    );
  try {
    const { action, ...data } = await req.json();
    return handle(req, String(action), data);
  } catch {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }
}
