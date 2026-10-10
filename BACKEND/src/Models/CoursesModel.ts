import { supabase } from "../Database/supabaseClient.js";

export type CourseUpdates = {
  courseCode?: string;
  courseName?: string;
  major?: string;
  professor?: string;
};

type CourseRow = {
  course_id: number;
  course_code: string;
  course_name: string;
  course_name_alt?: string | null;
  major: string;
  professor?: string | null;
};

function normalizeCourseCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

function extractCourseNumber(value: string) {
  const normalized = normalizeCourseCode(value);
  const match = normalized.match(/(\d+)$/);
  return match ? match[1] : null;
}

function normalizeProfessor(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getPairedMajor(major: string) {
  const normalized = major.trim().toLowerCase();

  if (normalized === "software engineering") return "Computer Science";
  if (normalized === "computer science") return "Software Engineering";

  return null;
}

export async function getAllCourses() {
  const { data, error } = await supabase
    .from("courses")
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    )
    .order("major", { ascending: true })
    .order("course_code", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Returns courses grouped by course_code within a major.
export async function getCoursesByMajor(major: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("course_id, course_code, course_name, course_name_alt")
    .eq("major", major)
    .order("course_code", { ascending: true });

  if (error) throw error;

  const groupMap: Record<
    string,
    {
      courseName: string;
      offerings: { id: string; altName: string | null }[];
    }
  > = {};

  for (const row of data ?? []) {
    const existing = groupMap[row.course_code];

    if (!existing) {
      groupMap[row.course_code] = {
        courseName: row.course_name ?? row.course_code,
        offerings: [
          {
            id: String(row.course_id),
            altName: row.course_name_alt ?? null,
          },
        ],
      };
    } else {
      existing.offerings.push({
        id: String(row.course_id),
        altName: row.course_name_alt ?? null,
      });
    }
  }

  return Object.entries(groupMap).map(([courseCode, value]) => ({
    courseCode,
    courseName: value.courseName,
    offerings: value.offerings,
  }));
}

export async function getCourseById(courseId: number) {
  const { data, error } = await supabase
    .from("courses")
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    )
    .eq("course_id", courseId)
    .single();

  if (error) throw error;
  return data as CourseRow;
}

export async function updateCourse(courseId: number, updates: CourseUpdates) {
  const payload: Record<string, unknown> = {};

  if (updates.courseCode !== undefined)
    payload.course_code = updates.courseCode;
  if (updates.courseName !== undefined)
    payload.course_name = updates.courseName;
  if (updates.major !== undefined) payload.major = updates.major;
  if (updates.professor !== undefined) payload.professor = updates.professor;

  const { data, error } = await supabase
    .from("courses")
    .update(payload)
    .eq("course_id", courseId)
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    )
    .single();

  if (error) throw error;
  return data as CourseRow;
}

export async function findPairedCoursesByCodeAndProfessor(
  sourceCourseId: number,
  sourceCourseCode: string,
  sourceMajor: string,
  sourceProfessor: string,
) {
  const pairedMajor = getPairedMajor(sourceMajor);
  if (!pairedMajor) return [];

  const sourceNumber = extractCourseNumber(sourceCourseCode);
  if (!sourceNumber) return [];

  const normalizedProfessor = normalizeProfessor(sourceProfessor || "");

  const { data, error } = await supabase
    .from("courses")
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    )
    .eq("major", pairedMajor);

  if (error) throw error;

  return ((data ?? []) as CourseRow[]).filter((row) => {
    if (row.course_id === sourceCourseId) return false;

    const rowNumber = extractCourseNumber(row.course_code ?? "");
    const rowProfessor = normalizeProfessor(row.professor ?? "");

    return rowNumber === sourceNumber && rowProfessor === normalizedProfessor;
  });
}

export async function updateCrossMajorMatchingCoursesByCodeAndProfessor(
  sourceCourseId: number,
  sourceCourseCode: string,
  sourceMajor: string,
  sourceProfessor: string,
  updates: CourseUpdates,
) {
  const matches = await findPairedCoursesByCodeAndProfessor(
    sourceCourseId,
    sourceCourseCode,
    sourceMajor,
    sourceProfessor,
  );

  if (matches.length === 0) return [];

  const payload: Record<string, unknown> = {};

  // keep each row's own code + major
  if (updates.courseName !== undefined)
    payload.course_name = updates.courseName;
  if (updates.professor !== undefined) payload.professor = updates.professor;

  if (Object.keys(payload).length === 0) return matches;

  const ids = matches.map((row) => row.course_id);

  const { data, error } = await supabase
    .from("courses")
    .update(payload)
    .in("course_id", ids)
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    );

  if (error) throw error;
  return (data ?? []) as CourseRow[];
}

export async function findCoursesByCode(courseCode: string) {
  const normalizedCode = normalizeCourseCode(courseCode);

  const { data, error } = await supabase
    .from("courses")
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    );

  if (error) throw error;

  return (data ?? []).filter(
    (row) => normalizeCourseCode(row.course_code ?? "") === normalizedCode,
  );
}

export async function createCourse(input: {
  courseCode: string;
  courseName: string;
  courseNameAlt?: string;
  major: string;
  professor?: string;
}) {
  const payload = {
    course_code: input.courseCode.trim(),
    course_name: input.courseName.trim(),
    course_name_alt: input.courseNameAlt?.trim() || null,
    major: input.major.trim(),
    professor: input.professor?.trim() ?? "",
  };

  const { data, error } = await supabase
    .from("courses")
    .insert([payload])
    .select(
      "course_id, course_code, course_name, course_name_alt, major, professor",
    )
    .single();

  if (error) throw error;
  return data;
}
