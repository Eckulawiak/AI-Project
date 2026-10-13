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
  major_id?: number | null;
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

const COURSE_COLUMNS =
  "course_id, course_code, course_name, course_name_alt, major, major_id, professor";

// PostgREST caps each response (1000 rows by default), so page through.
const PAGE_SIZE = 1000;
// Keep .in() lists short enough to fit in a request URL.
const IN_CHUNK = 200;

export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

export function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function sortCourses<T extends { major: string; course_code: string }>(
  rows: T[],
) {
  return rows.sort(
    (a, b) =>
      a.major.localeCompare(b.major) ||
      a.course_code.localeCompare(b.course_code),
  );
}

export async function getAllCourses() {
  const rows = await fetchAllPages<CourseRow>((from, to) =>
    supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .order("course_id", { ascending: true })
      .range(from, to),
  );
  return sortCourses(rows);
}

export async function getCoursesByIds(courseIds: number[]) {
  const rows: CourseRow[] = [];
  for (const ids of chunk(Array.from(new Set(courseIds)))) {
    const { data, error } = await supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .in("course_id", ids);
    if (error) throw error;
    rows.push(...((data ?? []) as CourseRow[]));
  }
  return sortCourses(rows);
}

// A course belongs to a major when courses.major_id points at it (the
// major's own subject) or major_courses lists it as a requirement.
export async function getCourseIdsForMajors(majorIds: number[]) {
  const ids = new Set<number>();
  if (majorIds.length === 0) return ids;

  for (const group of chunk(majorIds)) {
    const [owned, required] = await Promise.all([
      fetchAllPages<{ course_id: number }>((from, to) =>
        supabase
          .from("courses")
          .select("course_id")
          .in("major_id", group)
          .order("course_id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<{ course_id: number }>((from, to) =>
        supabase
          .from("major_courses")
          .select("course_id")
          .in("major_id", group)
          .order("course_id", { ascending: true })
          .range(from, to),
      ),
    ]);
    for (const row of [...owned, ...required]) ids.add(row.course_id);
  }

  return ids;
}

// course id -> every major it belongs to (see getCourseIdsForMajors)
export async function getMajorIdsForCourses(
  courses: Array<{ course_id: number; major_id?: number | null }>,
) {
  const map = new Map<number, Set<number>>();
  const add = (courseId: number, majorId: number) => {
    if (!map.has(courseId)) map.set(courseId, new Set());
    map.get(courseId)!.add(majorId);
  };

  for (const c of courses) if (c.major_id != null) add(c.course_id, c.major_id);

  for (const ids of chunk(courses.map((c) => c.course_id))) {
    const { data, error } = await supabase
      .from("major_courses")
      .select("course_id, major_id")
      .in("course_id", ids);
    if (error) throw error;
    for (const row of data ?? []) add(row.course_id, row.major_id);
  }

  return map;
}

// Courses for one major, grouped by course_code. Rows that share a code
// (special-topics alternate titles) come back as separate offerings.
export async function getCoursesForMajor(majorId: number) {
  const courseIds = await getCourseIdsForMajors([majorId]);
  const base = await getCoursesByIds([...courseIds]);
  const codes = Array.from(new Set(base.map((c) => c.course_code)));

  const rows: CourseRow[] = [];
  for (const group of chunk(codes)) {
    const { data, error } = await supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .in("course_code", group)
      .eq("is_active", true);
    if (error) throw error;
    rows.push(...((data ?? []) as CourseRow[]));
  }

  rows.sort(
    (a, b) =>
      a.course_code.localeCompare(b.course_code) || a.course_id - b.course_id,
  );

  const groupMap = new Map<
    string,
    { courseName: string; offerings: { id: string; altName: string | null }[] }
  >();

  for (const row of rows) {
    const offering = {
      id: String(row.course_id),
      altName: row.course_name_alt ?? null,
    };
    const existing = groupMap.get(row.course_code);
    if (existing) existing.offerings.push(offering);
    else
      groupMap.set(row.course_code, {
        courseName: row.course_name ?? row.course_code,
        offerings: [offering],
      });
  }

  return Array.from(groupMap, ([courseCode, value]) => ({
    courseCode,
    courseName: value.courseName,
    offerings: value.offerings,
  }));
}

export async function getCourseById(courseId: number) {
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_COLUMNS)
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
    .select(COURSE_COLUMNS)
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
    .select(COURSE_COLUMNS)
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
    .select(COURSE_COLUMNS);

  if (error) throw error;
  return (data ?? []) as CourseRow[];
}

export async function findCoursesByCode(courseCode: string) {
  const normalizedCode = normalizeCourseCode(courseCode);
  const courseNumber = extractCourseNumber(courseCode);

  // Narrow by the trailing number in the DB; the table is too big to scan
  // in one response.
  let query = supabase.from("courses").select(COURSE_COLUMNS);
  if (courseNumber) query = query.ilike("course_code", `%${courseNumber}`);
  const data = await fetchAllPages<CourseRow>((from, to) =>
    query.order("course_id", { ascending: true }).range(from, to),
  );

  return data.filter(
    (row) => normalizeCourseCode(row.course_code ?? "") === normalizedCode,
  );
}

export async function createCourse(input: {
  courseCode: string;
  courseName: string;
  courseNameAlt?: string;
  major: string;
  majorId?: number | null;
  professor?: string;
}) {
  const payload = {
    course_code: input.courseCode.trim(),
    course_name: input.courseName.trim(),
    course_name_alt: input.courseNameAlt?.trim() || null,
    major: input.major.trim(),
    major_id: input.majorId ?? null,
    professor: input.professor?.trim() ?? "",
  };

  const { data, error } = await supabase
    .from("courses")
    .insert([payload])
    .select(COURSE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}
