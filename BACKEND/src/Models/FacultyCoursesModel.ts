import { supabase } from "../Database/supabaseClient.js";
import { fetchAllPages } from "./CoursesModel.js";

const COURSE_COLUMNS =
  "course_id, course_code, course_name, course_name_alt, major, major_id, professor";

// Return just the course IDs a faculty member owns via faculty_courses
export async function getFacultyCourseIds(facultyId: number) {
  const { data, error } = await supabase
    .from("faculty_courses")
    .select("course_id")
    .eq("faculty_id", facultyId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row: any) => row.course_id as number)
    .filter((id) => typeof id === "number");
}

// Look up the full name of a faculty member
export async function getFacultyName(facultyId: number): Promise<string> {
  const { data, error } = await supabase
    .from("faculty_admin")
    .select("firstname, lastname")
    .eq("faculty_id", facultyId)
    .single();

  if (error) throw new Error(error.message);
  return `${data.firstname} ${data.lastname}`.trim();
}

/**
 * Returns all courses visible to a faculty member in a single query.
 * A course is visible if ANY of these are true:
 * 1. The faculty member owns it via faculty_courses
 * 2. The course professor field is blank / null (unassigned)
 * 3. The course professor field matches the faculty member's full name
 *
 * Filtering and joining happen in the DB — nothing is fetched and discarded
 * in JavaScript.
 */
export async function getVisibleCoursesForFaculty(
  facultyId: number,
  facultyFullName: string,
) {
  // Fetch owned course IDs and all matching courses in parallel
  const [ownedIds, byName, unassigned] = await Promise.all([
    getFacultyCourseIds(facultyId),

    // Courses where professor matches the faculty member's name
    supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .ilike("professor", facultyFullName)
      .order("major", { ascending: true })
      .order("course_code", { ascending: true }),

    // Courses where professor is blank / null
    supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .or("professor.is.null,professor.eq.")
      .order("major", { ascending: true })
      .order("course_code", { ascending: true }),
  ]);

  if (byName.error) throw new Error(byName.error.message);
  if (unassigned.error) throw new Error(unassigned.error.message);

  // Fetch owned courses by ID if there are any
  let ownedRows: any[] = [];
  if (ownedIds.length > 0) {
    const { data, error } = await supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .in("course_id", ownedIds)
      .order("major", { ascending: true })
      .order("course_code", { ascending: true });

    if (error) throw new Error(error.message);
    ownedRows = data ?? [];
  }

  // Merge all three sets, deduplicate by course_id
  const seen = new Set<number>();
  const merged: any[] = [];

  for (const row of [
    ...ownedRows,
    ...(byName.data ?? []),
    ...(unassigned.data ?? []),
  ]) {
    if (!seen.has(row.course_id)) {
      seen.add(row.course_id);
      merged.push(row);
    }
  }

  // Sort merged result by major then course_code
  merged.sort((a, b) => {
    const majorCmp = a.major.localeCompare(b.major);
    if (majorCmp !== 0) return majorCmp;
    return a.course_code.localeCompare(b.course_code);
  });

  return merged;
}

/**
 * Returns courses where the professor field is null, an empty string,
 * or specifically labeled "N/A".
 */
export async function getUnassignedCourses() {
  return fetchAllPages<any>((from, to) =>
    supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .or("professor.is.null,professor.eq.,professor.eq.N/A")
      .order("major", { ascending: true })
      .order("course_code", { ascending: true })
      .order("course_id", { ascending: true })
      .range(from, to),
  );
}

export async function assignCourseToFaculty(
  facultyId: number,
  courseId: number,
) {
  const { error } = await supabase.from("faculty_courses").insert([
    {
      faculty_id: facultyId,
      course_id: courseId,
    },
  ]);

  if (error) throw new Error(error.message);
}
