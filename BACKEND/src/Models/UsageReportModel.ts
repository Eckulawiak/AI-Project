// Usage numbers for the admin report (REQ-PROG-8). Counts only; no user ids,
// names or emails are returned.
import { supabase } from "../Database/supabaseClient.js";
import { fetchAllPages } from "./CoursesModel.js";

export const REPORT_PERIODS = [7, 30, 90, 365] as const;

const msg = (e: any) => (e?.message ? String(e.message) : "Database error");

async function count(
  table: string,
  apply: (q: any) => any = (q) => q,
): Promise<number> {
  const { count: n, error } = await apply(
    supabase.from(table).select("*", { count: "exact", head: true }),
  );
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

// Tables that may not exist yet in every environment report null instead of
// failing the whole report.
async function optionalCount(table: string, apply?: (q: any) => any) {
  try {
    return await count(table, apply);
  } catch (e) {
    console.error(`Usage report: skipped ${table}:`, e);
    return null;
  }
}

export async function getUsageReport(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let logins: Array<{ user_id: number | null; user_type: string | null; created_at: string }>;
  try {
    logins = await fetchAllPages((from, to) =>
      supabase
        .from("auditlogs")
        .select("user_id, user_type, created_at")
        .eq("action", "LOGIN")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
  } catch (e) {
    throw new Error(`auditlogs: ${msg(e)}`);
  }

  const role = (t: string | null) => (t ?? "").toUpperCase();
  const activeOf = (r: string) =>
    new Set(logins.filter((l) => role(l.user_type) === r && l.user_id != null).map((l) => l.user_id)).size;
  const loginsOf = (r: string) => logins.filter((l) => role(l.user_type) === r).length;

  // Logins per day for the chart, oldest first, including empty days.
  const perDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    perDay.set(d, 0);
  }
  for (const l of logins) {
    const d = l.created_at.slice(0, 10);
    if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }

  const since_ = (col: string) => (q: any) => q.gte(col, since);

  const [
    studentsTotal,
    facultyTotal,
    adminsTotal,
    talkingPointsSaved,
    assessmentsCompleted,
    roadmapsGenerated,
    milestonesCompleted,
    aiGenerations,
    aiFailures,
    studentsWithRoadmaps,
  ] = await Promise.all([
    count("student"),
    count("faculty_admin", (q) => q.eq("type", false)),
    count("faculty_admin", (q) => q.eq("type", true)),
    optionalCount("history", since_("date")),
    optionalCount("student_assessments", since_("completed_at")),
    optionalCount("student_roadmaps", since_("generated_at")),
    optionalCount("student_milestones", (q) => q.eq("status", "COMPLETE").gte("completed_at", since)),
    optionalCount("ai_usage_log", since_("created_at")),
    optionalCount("ai_usage_log", (q) => q.eq("success", false).gte("created_at", since)),
    optionalCount("student_roadmaps"),
  ]);

  return {
    periodDays: days,
    since,
    students: {
      total: studentsTotal,
      active: activeOf("STUDENT"),
      logins: loginsOf("STUDENT"),
      withRoadmap: studentsWithRoadmaps,
    },
    faculty: {
      total: facultyTotal,
      active: activeOf("FACULTY"),
      logins: loginsOf("FACULTY"),
    },
    admins: {
      total: adminsTotal,
      active: activeOf("ADMIN"),
      logins: loginsOf("ADMIN"),
    },
    activity: {
      talkingPointsSaved,
      assessmentsCompleted,
      roadmapsGenerated,
      milestonesCompleted,
      aiGenerations,
      aiFailures,
    },
    loginsPerDay: [...perDay.entries()].map(([date, n]) => ({ date, logins: n })),
  };
}
