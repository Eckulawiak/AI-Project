import { supabase } from "../Database/supabaseClient.js";

export type HistoryRow = {
  id: number;
  Date: string;
  CourseName: string;
  CourseCode: string;
  TalkingPoint: string;
};

type StudentHistoryRow = {
  student_id: number;
  history_id: number;
};

// DB columns are lowercase; the API keeps the HistoryRow shape
function toHistoryRow(row: any): HistoryRow {
  return {
    id: row.id,
    Date: row.date,
    CourseName: row.coursename,
    CourseCode: row.coursecode,
    TalkingPoint: row.talkingpoint,
  };
}

function cleanTalkingPoints(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

export async function saveTalkingPointsForStudent(
  reqStudentId: number,
  reqCourseCode: string,
  reqCourseName: string,
  reqTalkingPoints: string[],
) {
  // We renamed the incoming parameters above so we can safely declare our formatted variables here
  const studentId = Number(reqStudentId);
  const courseName = String(reqCourseName ?? "").trim();
  const courseCode = String(reqCourseCode ?? "")
    .trim()
    .toUpperCase();
  const talkingPoints = cleanTalkingPoints(reqTalkingPoints);

  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new Error("Invalid studentId");
  }

  if (!courseName) {
    throw new Error("courseName is required");
  }

  if (!courseCode) {
    throw new Error("courseCode is required");
  }

  if (talkingPoints.length === 0) {
    throw new Error("At least one talking point is required");
  }

  // 🔥 include coursecode here
  const historyPayload = talkingPoints.map((point) => ({
    coursename: courseName,
    coursecode: courseCode,
    talkingpoint: point,
  }));

  const { data: insertedHistory, error: historyInsertError } = await supabase
    .from("history")
    .insert(historyPayload)
    .select("id, date, coursename, coursecode, talkingpoint");

  if (historyInsertError) throw historyInsertError;

  const historyRows = (insertedHistory ?? []).map(toHistoryRow);

  // map to student
  const studentHistoryPayload = historyRows.map((row) => ({
    student_id: studentId,
    history_id: row.id,
  }));

  const { error: joinInsertError } = await supabase
    .from("student_history")
    .insert(studentHistoryPayload);

  if (joinInsertError) {
    // Roll back so a failed link doesn't leave history rows no student can see
    await supabase
      .from("history")
      .delete()
      .in(
        "id",
        historyRows.map((row) => row.id),
      );
    throw joinInsertError;
  }

  return historyRows;
}
export async function getHistoryForStudent(studentId: number) {
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new Error("Invalid studentId");
  }

  const { data, error } = await supabase
    .from("student_history")
    .select(
      `
      student_id,
      history_id,
      history (
        id,
        date,
        coursename,
        coursecode,
        talkingpoint
      )
    `,
    )
    .eq("student_id", studentId);

  if (error) throw error;

  const rows = (data ?? [])
    .map((row: any) => row.history)
    .filter(Boolean)
    .map(toHistoryRow)
    .sort(
      (a: HistoryRow, b: HistoryRow) =>
        new Date(b.Date).getTime() - new Date(a.Date).getTime(),
    );

  return rows as HistoryRow[];
}

export async function deleteHistoryEntryForStudent(
  studentId: number,
  historyId: number,
) {
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new Error("Invalid studentId");
  }

  if (!Number.isInteger(historyId) || historyId <= 0) {
    throw new Error("Invalid historyId");
  }

  // 1) Verify the student actually has this history entry
  const { data: existingLink, error: existingLinkError } = await supabase
    .from("student_history")
    .select("student_id, history_id")
    .eq("student_id", studentId)
    .eq("history_id", historyId)
    .maybeSingle();

  if (existingLinkError) throw existingLinkError;

  if (!existingLink) {
    throw new Error("History entry not found for this student");
  }

  // 2) Delete ALL mappings for this history entry (not just this student)
  const { error: deleteAllMappingsError } = await supabase
    .from("student_history")
    .delete()
    .eq("history_id", historyId);

  if (deleteAllMappingsError) throw deleteAllMappingsError;

  // 3) Delete the history row itself
  const { error: deleteHistoryError } = await supabase
    .from("history")
    .delete()
    .eq("id", historyId);

  if (deleteHistoryError) throw deleteHistoryError;

  return {
    success: true,
    deletedHistoryId: historyId,
  };
}

export async function deleteAllHistoryForStudent(studentId: number) {
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new Error("Invalid studentId");
  }

  // 1) Find all history IDs linked to this student
  const { data: links, error: fetchError } = await supabase
    .from("student_history")
    .select("history_id")
    .eq("student_id", studentId);

  if (fetchError) throw fetchError;

  if (!links || links.length === 0) {
    return { success: true, message: "No history found to clear." };
  }

  const historyIds = links.map((link) => link.history_id);

  // 2) Delete the mappings for this student
  const { error: mappingDeleteError } = await supabase
    .from("student_history")
    .delete()
    .eq("student_id", studentId);

  if (mappingDeleteError) throw mappingDeleteError;

  // 3) Delete the actual history rows
  const { error: historyDeleteError } = await supabase
    .from("history")
    .delete()
    .in("id", historyIds);

  if (historyDeleteError) throw historyDeleteError;

  return {
    success: true,
    deletedCount: historyIds.length,
  };
}
