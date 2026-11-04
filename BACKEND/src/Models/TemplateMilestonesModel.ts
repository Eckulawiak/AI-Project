// Admin editing of roadmap templates' milestones. Students' roadmaps copy
// a milestone when they are built, so edits show up the next time a roadmap
// is generated; deleting a template row keeps students' copies
// (student_milestones.template_milestone_id is set null).
import { supabase } from "../Database/supabaseClient.js";
import type { Category, ClassYear } from "../Utils/progress.js";

export type TemplateSummary = {
  id: number;
  name: string;
  schoolId: number | null;
  school: string | null;
  majorId: number | null;
  major: string | null;
  goalType: string;
  milestoneCount: number;
};

export type TemplateMilestoneInput = {
  category: Category;
  classYear: ClassYear;
  name: string;
  description: string | null;
  component: string | null;
  resources: string[];
  position: number | null;
  competencyIds: number[];
  gapCompetencyId: number | null;
};

export type AdminTemplateMilestone = TemplateMilestoneInput & {
  id: number;
  templateId: number;
  courseId: number | null;
};

export class NotFoundError extends Error {}

// University default first, then schools, then majors, by name.
export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await supabase
    .from("roadmap_templates")
    .select(
      "id, name, school_id, major_id, goal_type, schools(name), majors(name), template_milestones(count)",
    )
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const rank = (t: any) => (t.major_id != null ? 2 : t.school_id != null ? 1 : 0);
  return (data ?? [])
    .sort((a: any, b: any) => rank(a) - rank(b))
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      schoolId: t.school_id,
      school: t.schools?.name ?? null,
      majorId: t.major_id,
      major: t.majors?.name ?? null,
      goalType: t.goal_type,
      milestoneCount: t.template_milestones?.[0]?.count ?? 0,
    }));
}

const YEAR_ORDER = ["FIRST", "SOPH", "JUNIOR", "SENIOR"];

export async function getTemplateMilestonesForAdmin(
  templateId: number,
): Promise<AdminTemplateMilestone[]> {
  const { data, error } = await supabase
    .from("template_milestones")
    .select(
      "id, template_id, category, class_year, name, description, component, resources, position, course_id, gap_competency_id, template_milestone_competencies(competency_id)",
    )
    .eq("template_id", templateId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r: any) => ({
      id: r.id,
      templateId: r.template_id,
      category: r.category,
      classYear: r.class_year,
      name: r.name,
      description: r.description,
      component: r.component,
      resources: r.resources ?? [],
      position: r.position,
      courseId: r.course_id,
      gapCompetencyId: r.gap_competency_id,
      competencyIds: (r.template_milestone_competencies ?? []).map(
        (c: any) => c.competency_id as number,
      ),
    }))
    .sort(
      (a, b) =>
        YEAR_ORDER.indexOf(a.classYear) - YEAR_ORDER.indexOf(b.classYear) ||
        (a.position ?? 9999) - (b.position ?? 9999) ||
        a.id - b.id,
    );
}

const toRow = (m: TemplateMilestoneInput) => ({
  category: m.category,
  class_year: m.classYear,
  name: m.name,
  description: m.description,
  component: m.component,
  resources: m.resources,
  position: m.position,
  gap_competency_id: m.gapCompetencyId,
});

// The unique (template, year, component) index is what a duplicate hits.
function rowError(error: { code?: string; message: string }) {
  if (error.code === "23505")
    return new Error("This template already has a milestone for that year and component.");
  return new Error(error.message);
}

async function setCompetencies(milestoneId: number, competencyIds: number[]) {
  const { error: delError } = await supabase
    .from("template_milestone_competencies")
    .delete()
    .eq("template_milestone_id", milestoneId);
  if (delError) throw new Error(delError.message);
  if (competencyIds.length === 0) return;

  const { error } = await supabase.from("template_milestone_competencies").insert(
    [...new Set(competencyIds)].map((competency_id) => ({
      template_milestone_id: milestoneId,
      competency_id,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function createTemplateMilestone(
  templateId: number,
  input: TemplateMilestoneInput,
) {
  const { data: template, error: tplError } = await supabase
    .from("roadmap_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();
  if (tplError) throw new Error(tplError.message);
  if (!template) throw new NotFoundError("Template not found");

  const { data, error } = await supabase
    .from("template_milestones")
    .insert({ template_id: templateId, ...toRow(input) })
    .select("id")
    .single();
  if (error || !data) throw rowError(error ?? { message: "Could not add milestone" });

  await setCompetencies(data.id, input.competencyIds);
  return data.id as number;
}

export async function updateTemplateMilestone(
  milestoneId: number,
  input: TemplateMilestoneInput,
) {
  const { data, error } = await supabase
    .from("template_milestones")
    .update(toRow(input))
    .eq("id", milestoneId)
    .select("id");
  if (error) throw rowError(error);
  if (!data || data.length === 0) throw new NotFoundError("Milestone not found");

  await setCompetencies(milestoneId, input.competencyIds);
}

export async function deleteTemplateMilestone(milestoneId: number) {
  const { data, error } = await supabase
    .from("template_milestones")
    .delete()
    .eq("id", milestoneId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new NotFoundError("Milestone not found");
}
