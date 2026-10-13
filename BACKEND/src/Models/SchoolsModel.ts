import { supabase } from "../Database/supabaseClient.js";

export type MajorSummary = { id: number; name: string };

export type SchoolWithMajors = {
  id: number;
  name: string;
  majors: MajorSummary[];
};

// Every school with its majors nested, both sorted by name.
export async function getSchoolsWithMajors(): Promise<SchoolWithMajors[]> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, majors(id, name)")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((s: any) => ({
    id: s.id as number,
    name: s.name as string,
    majors: ((s.majors ?? []) as MajorSummary[])
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

// major id -> school id, for tagging course rows with their schools
export async function getMajorSchoolMap(): Promise<Map<number, number>> {
  const { data, error } = await supabase.from("majors").select("id, school_id");

  if (error) throw new Error(error.message);

  const map = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.school_id != null) map.set(row.id, row.school_id);
  }
  return map;
}

export async function getMajorIdsForSchool(
  schoolId: number,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("majors")
    .select("id")
    .eq("school_id", schoolId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.id as number);
}
