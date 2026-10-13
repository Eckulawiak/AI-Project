import React, { useEffect, useMemo, useState } from "react";
import Footer from "./footer";
import Navbar from "./Navbar";
import "./AdminDashboard.css";
import EditCourseMappingModal from "./EditCourseMappingModal";
import { loadSession, clearSession } from "./Session";
import { useSchools } from "./hooks/useSchools";

type CompletionStatus = "Mapped" | "Unmapped";
type CompletionFilter = "All" | "Mapped" | "Unmapped";

interface AdminCourseRow {
  id: number;
  course: string;
  courseName: string;
  altName: string | null;
  major: string;
  majorIds: number[];
  schoolIds: number[];
  professor: string;
  completion: CompletionStatus;
  skills: string[];
  competencies: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL is not defined");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = loadSession();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session && { Authorization: `Bearer ${session.token}` }),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/";
    throw new Error("Session expired, please log in again");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

const AdminDashboard: React.FC = () => {
  /* ------------------------------ Filters ------------------------------ */
  const schools = useSchools();
  // "" means All
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [majorFilter, setMajorFilter] = useState<string>("");
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("All");

  const availableMajors = useMemo(
    () => schools.find((s) => String(s.id) === schoolFilter)?.majors ?? [],
    [schools, schoolFilter],
  );

  /* ------------------------------ Table state ------------------------------ */
  const [rows, setRows] = useState<AdminCourseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id: number; code: string } | null>(
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Start on the School of Computing & Engineering once schools load
  useEffect(() => {
    if (schools.length === 0 || schoolFilter) return;
    const start = schools.find((s) => /computing/i.test(s.name)) ?? schools[0];
    setSchoolFilter(String(start.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (majorFilter) params.set("majorId", majorFilter);
        else if (schoolFilter) params.set("schoolId", schoolFilter);
        params.set("status", completionFilter);

        const data = await apiFetch<AdminCourseRow[]>(
          `/api/admin/courses?${params.toString()}`,
        );

        if (!cancelled) setRows(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load courses");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolFilter, majorFilter, completionFilter, refreshKey]);

  useEffect(() => {
    setEditing(null);
  }, [schoolFilter, majorFilter, completionFilter]);

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <div className="admin-dashboard">
      <Navbar />

      <div className="admin-content">
        <section className="admin-header">
          <h1 className="admin-title">Admin Dashboard</h1>
          <p className="admin-subtitle">Everything you need, in one place.</p>
        </section>

        <section className="admin-filter-bar">
          <div className="filter-left">
            <span className="filter-icon" aria-hidden="true">
              <i className="bi bi-funnel"></i>
            </span>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="school-select">
                Select School:
              </label>
              <select
                id="school-select"
                className="filter-select"
                value={schoolFilter}
                onChange={(e) => {
                  setSchoolFilter(e.target.value);
                  setMajorFilter("");
                }}
              >
                <option value="">All</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="major-select">
                Select Major:
              </label>
              <select
                id="major-select"
                className="filter-select"
                value={majorFilter}
                onChange={(e) => setMajorFilter(e.target.value)}
                disabled={!schoolFilter}
              >
                <option value="">All</option>
                {availableMajors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="completion-select">
                Completion:
              </label>
              <select
                id="completion-select"
                className="filter-select"
                value={completionFilter}
                onChange={(e) =>
                  setCompletionFilter(e.target.value as CompletionFilter)
                }
              >
                <option value="All">All</option>
                <option value="Mapped">Mapped</option>
                <option value="Unmapped">Unmapped</option>
              </select>
            </div>
          </div>
        </section>

        {loading && (
          <section className="admin-table-card">
            <div className="muted" style={{ padding: 16 }}>
              Loading courses…
            </div>
          </section>
        )}

        {error && (
          <section className="admin-table-card">
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>Couldn't load courses.</div>
              <div className="muted">{error}</div>
            </div>
          </section>
        )}

        {!loading && !error && (
          <section className="admin-table-card">
            <div className="admin-table">
              <div className="admin-table-row admin-table-header">
                <div className="admin-cell admin-cell-course">Course</div>
                <div className="admin-cell admin-cell-professor">Professor</div>
                <div className="admin-cell admin-cell-skills">Skills</div>
                <div className="admin-cell admin-cell-competencies">
                  Competencies
                </div>
              </div>

              {filteredRows.map((row) => (
                <div className="admin-table-row" key={row.id}>
                  <div className="admin-cell admin-cell-course">
                    <div className="course-code">{row.course}</div>
                    {(row.altName || row.courseName) && (
                      <div className="course-name">
                        {row.altName || row.courseName}
                      </div>
                    )}
                  </div>
                  <div className="admin-cell admin-cell-professor">
                    {row.professor ? (
                      row.professor
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                  <div className="admin-cell admin-cell-skills">
                    {row.skills.length > 0 ? (
                      <ul>
                        {row.skills.map((skill, idx) => (
                          <li key={idx}>{skill}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">No skills mapped yet</span>
                    )}
                  </div>
                  <div className="admin-cell admin-cell-competencies">
                    <div className="competency-content">
                      {row.competencies.length > 0 ? (
                        <ul>
                          {row.competencies.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">
                          No competencies mapped yet
                        </span>
                      )}
                      <button
                        type="button"
                        className="edit-icon-button"
                        aria-label={`Edit mapping for ${row.course}`}
                        onClick={() =>
                          setEditing({ id: row.id, code: row.course })
                        }
                      >
                        <i className="bi bi-pencil-square"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <EditCourseMappingModal
                isOpen={editing !== null}
                courseId={editing?.id ?? 0}
                courseCode={editing?.code ?? ""}
                professor={
                  editing
                    ? (rows.find((r) => r.id === editing.id)?.professor ?? "")
                    : ""
                }
                major={
                  editing
                    ? (rows.find((r) => r.id === editing.id)?.major ?? "")
                    : ""
                }
                onClose={() => setEditing(null)}
                onSaved={() => setRefreshKey((k) => k + 1)}
                apiFetch={apiFetch}
                isAdmin={true}
              />

              {filteredRows.length === 0 && (
                <div className="admin-table-row admin-empty-row">
                  <div className="admin-cell" style={{ gridColumn: "1 / 5" }}>
                    <span className="muted">
                      No courses match the selected filters.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default AdminDashboard;
