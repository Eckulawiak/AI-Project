import { getMajorIdsForCourses } from "../Models/CoursesModel.js";
import { getMappingsForCourseIds } from "../Models/CourseSkillMappingModel.js";
import { getMajorSchoolMap } from "../Models/SchoolsModel.js";

type CourseInput = {
  course_id: number;
  course_code: string;
  course_name: string;
  course_name_alt?: string | null;
  major: string;
  major_id?: number | null;
  professor?: string | null;
};

// Shapes course rows for the admin and faculty tables: mapping status plus
// every major and school the course belongs to, so the UI can filter on them.
export async function buildCourseRows(courses: CourseInput[], status?: string) {
  const ids = courses.map((c) => c.course_id);
  const [mappings, majorsByCourse, schoolByMajor] = await Promise.all([
    getMappingsForCourseIds(ids),
    getMajorIdsForCourses(courses),
    getMajorSchoolMap(),
  ]);

  const rows = courses.map((c) => {
    const { skills, competencies } = mappings.get(c.course_id) ?? {
      skills: [],
      competencies: [],
    };
    const majorIds = [...(majorsByCourse.get(c.course_id) ?? [])];
    const schoolIds = [
      ...new Set(
        majorIds
          .map((id) => schoolByMajor.get(id))
          .filter((id): id is number => id !== undefined),
      ),
    ];

    return {
      id: c.course_id,
      course: c.course_code,
      courseName: c.course_name,
      altName: c.course_name_alt ?? null,
      major: c.major,
      majorIds,
      schoolIds,
      professor: c.professor ?? "",
      completion:
        skills.length > 0 && competencies.length > 0 ? "Mapped" : "Unmapped",
      skills,
      competencies,
    };
  });

  if (!status || status === "All") return rows;
  return rows.filter((r) => r.completion === status);
}
