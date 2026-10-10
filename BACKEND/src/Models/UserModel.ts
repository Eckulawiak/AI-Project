import { supabase } from "../Database/supabaseClient.js";

export async function findStudentByEmail(email: string) {
  const { data } = await supabase
    .from("student")
    .select(
      "student_id, student_qu_email, firstname, lastname, major, password, reset_code, reset_code_expiry",
    )
    .eq("student_qu_email", email)
    .single();
  return data ?? null;
}

export async function findFacultyByEmail(email: string) {
  const { data } = await supabase
    .from("faculty_admin")
    .select(
      "faculty_id, faculty_qu_email, firstname, lastname, type, password, reset_code, reset_code_expiry",
    )
    .eq("faculty_qu_email", email)
    .single();
  return data ?? null;
}
