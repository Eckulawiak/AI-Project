import { supabase } from "../Database/supabaseClient.js";

export async function getMajors(): Promise<string[]> {
  const { data, error } = await supabase
    .from("majors")
    .select("name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data?.map((m: any) => m.name) ?? [];
}

export async function getMajorsWithIds(): Promise<
  Array<{ id: number; name: string }>
> {
  const { data, error } = await supabase
    .from("majors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: number; name: string }>;
}

export async function findMajorByName(
  majorName: string,
): Promise<{ id: number; name: string } | null> {
  const trimmed = majorName.trim();
  const { data, error } = await supabase
    .from("majors")
    .select("id, name")
    .ilike("name", trimmed)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any) ?? null;
}
