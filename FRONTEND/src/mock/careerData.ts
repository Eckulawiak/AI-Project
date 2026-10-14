// Fake data for the Skill Assessment, Roadmap and progress strip.
// Everything here is made up for demos. Replace with API calls once the
// roadmap and assessment endpoints exist (see SDS Section 3, /roadmap routes).

export type Category = "COURSE" | "SKILL" | "CERT" | "EXPERIENCE";
export type ClassYear = "FIRST" | "SOPH" | "JUNIOR" | "SENIOR";
export type GoalType = "INDUSTRY" | "GRAD";

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "COURSE", label: "Courses", icon: "bi-journal-bookmark" },
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

export const NACE_COMPETENCIES = [
  { id: 1, name: "Career & Self-Development", blurb: "Knowing your strengths and planning your next steps." },
  { id: 2, name: "Communication", blurb: "Writing and speaking clearly to different audiences." },
  { id: 3, name: "Critical Thinking", blurb: "Analyzing problems and making sound decisions." },
  { id: 4, name: "Equity & Inclusion", blurb: "Working respectfully with people of all backgrounds." },
  { id: 5, name: "Leadership", blurb: "Guiding a group and helping others do their best." },
  { id: 6, name: "Professionalism", blurb: "Reliability, integrity and good work habits." },
  { id: 7, name: "Teamwork", blurb: "Collaborating toward a shared goal." },
  { id: 8, name: "Technology", blurb: "Using tools and technology effectively and ethically." },
];

export const RATING_LABELS = ["Just starting", "Developing", "Confident", "Strong"];

export interface MockCourse {
  code: string;
  name: string;
  skills: string[];
  competencyIds: number[];
}

// A handful of real-looking CS courses. The skills are invented for the demo.
export const MOCK_COURSES: MockCourse[] = [
  { code: "CSC 110", name: "Programming and Problem Solving", skills: ["Python", "Debugging"], competencyIds: [3, 8] },
  { code: "CSC 111", name: "Data Structures and Abstraction", skills: ["Java", "Data structures"], competencyIds: [3, 8] },
  { code: "CSC 215", name: "Algorithms", skills: ["Algorithm analysis", "Problem decomposition"], competencyIds: [3] },
  { code: "CSC 225", name: "Database Systems", skills: ["SQL", "Data modeling"], competencyIds: [3, 8] },
  { code: "SER 225", name: "Introduction to Software Development", skills: ["Git", "Team projects"], competencyIds: [7, 8] },
  { code: "SER 325", name: "Software Requirements", skills: ["Requirements writing", "Stakeholder interviews"], competencyIds: [2, 7] },
  { code: "CSC 340", name: "Computer Networks", skills: ["Networking", "Linux"], competencyIds: [8] },
  { code: "SER 491", name: "Senior Capstone I", skills: ["Agile / Scrum", "Presenting to clients"], competencyIds: [2, 5, 7] },
];

export interface Milestone {
  id: string;
  name: string;
  description: string;
  category: Category;
  classYear: ClassYear;
  competencyIds: number[];
  status: "PENDING" | "COMPLETE";
  courseCode?: string;
}

const m = (
  id: string,
  category: Category,
  classYear: ClassYear,
  name: string,
  description: string,
  competencyIds: number[],
  done = false,
  courseCode?: string,
): Milestone => ({
  id,
  category,
  classYear,
  name,
  description,
  competencyIds,
  status: done ? "COMPLETE" : "PENDING",
  courseCode,
});

// Base roadmap for a made-up Computer Science junior headed for industry.
export const BASE_MILESTONES: Milestone[] = [
  // Courses (one per mock course so the assessment can tick them off)
  m("c-110", "COURSE", "FIRST", "Complete CSC 110", "Programming and Problem Solving — your first programming course.", [3, 8], true, "CSC 110"),
  m("c-111", "COURSE", "FIRST", "Complete CSC 111", "Data Structures and Abstraction.", [3, 8], true, "CSC 111"),
  m("c-225s", "COURSE", "SOPH", "Complete SER 225", "Introduction to Software Development, your first team project course.", [7, 8], true, "SER 225"),
  m("c-215", "COURSE", "SOPH", "Complete CSC 215", "Algorithms — a common topic in technical interviews.", [3], false, "CSC 215"),
  m("c-225", "COURSE", "JUNIOR", "Complete CSC 225", "Database Systems: SQL and data modeling.", [3, 8], false, "CSC 225"),
  m("c-325", "COURSE", "JUNIOR", "Complete SER 325", "Software Requirements: working with stakeholders.", [2, 7], false, "SER 325"),
  m("c-340", "COURSE", "SENIOR", "Complete CSC 340", "Computer Networks.", [8], false, "CSC 340"),
  m("c-491", "COURSE", "SENIOR", "Complete SER 491", "Senior Capstone I — build a real product for a client.", [2, 5, 7], false, "SER 491"),

  // Skills
  m("s-git", "SKILL", "FIRST", "Learn Git basics", "Commit, branch and open a pull request on GitHub.", [8], true),
  m("s-portfolio", "SKILL", "SOPH", "Publish a portfolio site", "A simple personal site that links your projects and resume.", [1, 2], false),
  m("s-sql", "SKILL", "JUNIOR", "Write intermediate SQL", "Joins, grouping and indexes on a real dataset.", [3, 8], false),
  m("s-present", "SKILL", "JUNIOR", "Give a technical presentation", "Present a project to a class or club for 10 minutes.", [2], false),
  m("s-lead", "SKILL", "SENIOR", "Lead a team sprint", "Act as scrum master or team lead for one sprint.", [5, 7], false),

  // Certifications
  m("ct-aws", "CERT", "JUNIOR", "AWS Cloud Practitioner", "An entry-level cloud certification valued by many employers.", [8], false),
  m("ct-scrum", "CERT", "SENIOR", "Scrum Fundamentals Certified", "A free, short certification on Agile teamwork.", [7, 6], false),

  // Internships & experience
  m("e-club", "EXPERIENCE", "FIRST", "Join a student club", "Join a club such as ACM or the coding club.", [7, 1], true),
  m("e-career", "EXPERIENCE", "SOPH", "Meet with Career Development", "Book a resume review with the career development office.", [1, 6], true),
  m("e-hack", "EXPERIENCE", "SOPH", "Attend a hackathon", "Build something in a weekend with a small team.", [7, 3], false),
  m("e-intern-apply", "EXPERIENCE", "JUNIOR", "Apply to 10 summer internships", "Use Handshake and LinkedIn; tailor your resume to each role.", [1, 6], false),
  m("e-intern", "EXPERIENCE", "SENIOR", "Complete a summer internship", "A summer internship in software or IT.", [6, 7, 8], false),
];

// Extra milestones added when the assessment finds a weak competency.
// Keyed by NACE competency id.
export const GAP_MILESTONES: Record<number, Milestone> = {
  1: m("g-1", "EXPERIENCE", "JUNIOR", "Do a career-goals session", "Meet a career coach to set goals for the next year.", [1]),
  2: m("g-2", "SKILL", "JUNIOR", "Join a public speaking workshop", "Practice presenting in a low-pressure setting.", [2]),
  3: m("g-3", "SKILL", "JUNIOR", "Solve 20 practice problems", "LeetCode-style problems to sharpen problem solving.", [3]),
  4: m("g-4", "EXPERIENCE", "JUNIOR", "Attend an inclusion workshop", "A campus workshop on working across cultures.", [4]),
  5: m("g-5", "EXPERIENCE", "SENIOR", "Take a club leadership role", "Run for a club officer position or lead a project.", [5]),
  6: m("g-6", "SKILL", "JUNIOR", "Practice professional email", "Write follow-up emails after an interview or event.", [6]),
  7: m("g-7", "EXPERIENCE", "JUNIOR", "Join a team project outside class", "Contribute to an open-source or club project.", [7]),
  8: m("g-8", "CERT", "JUNIOR", "Earn a beginner tech certificate", "For example, Google IT Support or a cloud basics badge.", [8]),
};

export interface StudentProfile {
  firstName: string;
  school: string;
  major: string;
  classYear: ClassYear;
  careerGoal: string;
  goalType: GoalType;
}

export const MOCK_PROFILE: StudentProfile = {
  firstName: "Jordan",
  school: "School of Computing and Engineering",
  major: "Computer Science",
  classYear: "JUNIOR",
  careerGoal: "Software Engineer",
  goalType: "INDUSTRY",
};

export const MOCK_SCHOOLS: Record<string, string[]> = {
  "School of Computing and Engineering": ["Computer Science", "Software Engineering", "Cybersecurity"],
  "School of Business": ["Finance", "Marketing", "Management"],
  "College of Arts & Sciences": ["Psychology", "Biology", "Political Science"],
};

export interface ExperienceEntry {
  id: string;
  kind: "INTERNSHIP" | "JOB" | "CERT" | "PROJECT";
  title: string;
}

export interface AssessmentResult {
  profile: StudentProfile;
  completedCourses: string[];
  inProgressCourses: string[];
  ratings: Record<number, number>; // competency id → 1..4
  experience: ExperienceEntry[];
  completedAt: string;
}
