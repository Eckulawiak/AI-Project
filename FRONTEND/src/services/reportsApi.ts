// De-identified progress and usage reports for faculty (REQ-PROG-7,
// REQ-ROAD-8) and admins (REQ-PROG-8). Groups under the minimum size come
// back as { suppressed: true } with no numbers.
import { apiClient } from "./apiClient";
import type { Category, ClassYear } from "../career/careerData";

export type GroupStats =
  | { suppressed: true; minGroupSize: number }
  | {
      suppressed: false;
      students: number;
      avgOverall: number;
      medianOverall: number;
      byCategory: Record<Category, number>;
      reached: Record<"25" | "50" | "75", number>;
      byClassYear: Array<{ classYear: ClassYear; pct: number; milestones: number }>;
    };

export interface MilestoneTrend {
  name: string;
  category: Category;
  classYear: ClassYear | null;
  onRoadmaps: number;
  completedPct: number;
}

export interface Trends {
  mostCompleted: MilestoneTrend[];
  leastCompleted: MilestoneTrend[];
}

export interface FacultyProgressReport {
  minGroupSize: number;
  scope: {
    source: "ASSIGNED" | "COURSES" | "NONE";
    majors: Array<{ id: number; name: string; school: string | null }>;
  };
  overall: GroupStats | null;
  majors: Array<{ id: number; name: string; school: string | null; stats: GroupStats }>;
  schools: Array<{ id: number; name: string | null; stats: GroupStats }>;
  trends: Trends | null;
}

export interface UsageReport {
  periodDays: number;
  since: string;
  students: { total: number; active: number; logins: number; withRoadmap: number | null };
  faculty: { total: number; active: number; logins: number };
  admins: { total: number; active: number; logins: number };
  activity: {
    talkingPointsSaved: number | null;
    assessmentsCompleted: number | null;
    roadmapsGenerated: number | null;
    milestonesCompleted: number | null;
    aiGenerations: number | null;
    aiFailures: number | null;
  };
  loginsPerDay: Array<{ date: string; logins: number }>;
}

export interface AdminReport {
  minGroupSize: number;
  usage: UsageReport;
  progress: {
    overall: GroupStats;
    trends: Trends | null;
    schools: Array<{ id: number; name: string; studentsWithRoadmaps: number | null; stats: GroupStats }>;
  };
}

export const REPORT_PERIODS = [7, 30, 90, 365] as const;

export const getFacultyProgress = () =>
  apiClient<FacultyProgressReport>("/api/faculty/progress");

export const getAdminReport = (days: number) =>
  apiClient<AdminReport>(`/api/admin/reports?days=${days}`);
