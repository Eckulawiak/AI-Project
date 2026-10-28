// Shared types and labels for the Skill Assessment, Roadmap and progress
// strip. The data itself comes from the /api/roadmap, /api/milestones and
// /api/assessment routes (see services/careerApi.ts).

export type Category = "COURSE" | "CAREER_PREP" | "SKILL" | "CERT" | "EXPERIENCE";
export type ClassYear = "FIRST" | "SOPH" | "JUNIOR" | "SENIOR";
export type GoalType = "INDUSTRY" | "GRAD";
export type MilestoneStatus = "PENDING" | "COMPLETE";
export type MilestoneSource = "TEMPLATE" | "COURSE" | "GAP" | "EXPERIENCE" | "CUSTOM";
export type CourseStatus = "NONE" | "IN_PROGRESS" | "COMPLETED";

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "COURSE", label: "Courses", icon: "bi-journal-bookmark" },
  { id: "CAREER_PREP", label: "Career Prep", icon: "bi-compass" },
  { id: "SKILL", label: "Skills", icon: "bi-lightning-charge" },
  { id: "CERT", label: "Certifications", icon: "bi-patch-check" },
  { id: "EXPERIENCE", label: "Internships & Experience", icon: "bi-briefcase" },
];

export const CLASS_YEARS: { id: ClassYear; label: string }[] = [
  { id: "FIRST", label: "First Year" },
  { id: "SOPH", label: "Sophomore" },
  { id: "JUNIOR", label: "Junior" },
  { id: "SENIOR", label: "Senior" },
];

export const RATING_LABELS = ["Just starting", "Developing", "Confident", "Strong"];

// Short explanations for the eight NACE competencies, keyed by a normalized
// name so "Equity & Inclusion" and "Equity and Inclusion" both match.
const BLURBS: Record<string, string> = {
  "career and self-development": "Knowing your strengths and planning your next steps.",
  communication: "Writing and speaking clearly to different audiences.",
  "critical thinking": "Analyzing problems and making sound decisions.",
  "equity and inclusion": "Working respectfully with people of all backgrounds.",
  leadership: "Guiding a group and helping others do their best.",
  professionalism: "Reliability, integrity and good work habits.",
  teamwork: "Collaborating toward a shared goal.",
  technology: "Using tools and technology effectively and ethically.",
};

export const competencyBlurb = (name: string) =>
  BLURBS[name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim()] ?? "";

export interface Competency {
  id: number;
  name: string;
}

export interface Milestone {
  id: number;
  name: string;
  description: string;
  category: Category;
  classYear: ClassYear;
  status: MilestoneStatus;
  source: MilestoneSource;
  courseId: number | null;
  courseCode: string | null;
  competencies: Competency[];
  component: string | null; // framework heading, e.g. "Networking"
  resources: string[]; // ways to work on it: courses, offices, events
  completedAt: string | null;
}

export interface StudentProfile {
  firstName: string;
  schoolId: number | null;
  school: string | null;
  majorId: number | null;
  major: string | null;
  classYear: ClassYear | null;
  careerGoal: string | null;
  goalType: GoalType | null;
}

export interface Progress {
  overall: number;
  byCategory: Record<Category, { done: number; total: number; pct: number }>;
}

export interface RoadmapResponse {
  profile: StudentProfile;
  roadmap: {
    id: number;
    templateName: string | null;
    usesDefaultTemplate: boolean;
    generatedAt: string;
  };
  lastAssessmentAt: string | null;
  milestones: Milestone[];
  progress: Progress;
}

export interface MilestoneUpdateResponse {
  milestone: Milestone;
  progress: Progress;
  crossedThreshold: number | null;
}

export interface ExperienceEntry {
  kind: "INTERNSHIP" | "JOB" | "CERT" | "PROJECT";
  title: string;
}

export interface AssessmentCourse {
  courseId: number;
  courseCode: string;
  courseName: string;
  skills: string[];
  competencies: Competency[];
  mapped: boolean;
  status: CourseStatus;
}

export interface AssessmentOptions {
  profile: StudentProfile;
  competencies: Competency[];
  majorId: number | null;
  courses: AssessmentCourse[];
}

export interface Assessment {
  id: number;
  ratings: Record<string, number>; // competency id -> 1..4
  experience: ExperienceEntry[];
  completedAt: string;
}

export interface AssessmentSubmission {
  profile: {
    majorId: number;
    classYear: ClassYear;
    careerGoal: string;
    goalType: GoalType;
  };
  courses: { courseId: number; status: CourseStatus }[];
  ratings: Record<string, number>;
  experience: ExperienceEntry[];
}
