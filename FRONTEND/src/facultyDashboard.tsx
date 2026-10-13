/* eslint-disable @typescript-eslint/no-unused-vars */
// src/facultyDashboard.tsx
import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import Footer from "./footer";
import Navbar from "./Navbar";
import "./facultyDashboard.css";
import EditCourseMappingModal from "./EditCourseMappingModal";
import { loadSession, clearSession } from "./Session";
import AddCourseMappingModal from "./AddCourseMappingModal";
import { useSchools } from "./hooks/useSchools";

// ─── Types ────────────────────────────────────────────────────────────────────

type CompletionStatus = "Mapped" | "Unmapped";
type CompletionFilter = "All" | "Mapped" | "Unmapped";
type MajorOption = string;

interface FacultyCourseRow {
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

interface SkillOption {
  Skill_Id: number;
  Skill_name: string;
  Type: boolean;
}

// ─── API helper (mirrors AdminDashboard exactly) ──────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

const FacultyDashboard: React.FC = () => {
  // ── Filters ───────────────────────────────────────────────────────────────
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("All");
  const schools = useSchools();
  // "" means All
  const [schoolFilter, setSchoolFilter] = useState<string>("");
  const [majorFilter, setMajorFilter] = useState<string>("");

  // ── Table state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FacultyCourseRow[]>([]);
  const [unassignedRows, setUnassignedRows] = useState<FacultyCourseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Unassigned table toggle ───────────────────────────────────────────────
  const [unassignedOpen, setUnassignedOpen] = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<{ id: number; code: string } | null>(
    null,
  );

  // ── Add Course Form state ────────────────────────────────────────────────
  const MAJOR_PREFIX_MAP: Record<string, string> = {
    Engineering: "ENR",
    "Software Engineering": "SER",
    "Computer Science": "CSC",
    "Mechanical Engineering": "MER",
    "Industrial Engineering": "IER",
    "Civil Engineering": "CER",
  };

  const [selectedMajor, setSelectedMajor] = useState<MajorOption>(
    "Software Engineering",
  );
  const [, setFormMajors] = useState<string[]>([]);
  const [prefixError, setPrefixError] = useState<string | null>(null);

  const [alternateCourseTitle, setAlternateCourseTitle] = useState("");
  const [duplicateCodeFound, setDuplicateCodeFound] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseSkills, setCourseSkills] = useState("");

  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>(
    [],
  );
  const [competencyOptions, setCompetencyOptions] = useState<SkillOption[]>([]);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const parseSkillNames = (value: string): string[] =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const formatCourseCode = (value: string) => {
    const cleaned = value.trim().toUpperCase();
    const match = cleaned.match(/^([A-Z]+)[\s-]*(\d+)$/);
    if (!match) return cleaned;
    return `${match[1]}-${match[2]}`;
  };

  const toggleCompetency = (id: number) => {
    setSelectedCompetencyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const validateCoursePrefix = (code: string, major: string) => {
    const trimmed = code.trim().toUpperCase();

    if (!trimmed || !major) {
      setPrefixError(null);
      return;
    }

    const expectedPrefix = MAJOR_PREFIX_MAP[major];
    if (!expectedPrefix) {
      setPrefixError(null);
      return;
    }

    const match = trimmed.match(/^[A-Z]+/);
    const enteredPrefix = match ? match[0] : "";

    if (enteredPrefix !== expectedPrefix) {
      setPrefixError(
        `Course code must start with "${expectedPrefix}" for ${major}.`,
      );
    } else {
      setPrefixError(null);
    }
  };

  const checkDuplicateCourseCode = async (code: string) => {
    const formattedCode = formatCourseCode(code);

    if (!formattedCode) {
      setDuplicateCodeFound(false);
      setAlternateCourseTitle("");
      return;
    }

    try {
      setCheckingDuplicate(true);

      const params = new URLSearchParams();
      params.set("courseCode", formattedCode);

      const data = await apiFetch<{ exists?: boolean }>(
        `/api/faculty/courses/check-code?${params.toString()}`,
      );

      const isDuplicate = Boolean(data?.exists);
      setDuplicateCodeFound(isDuplicate);

      if (!isDuplicate) {
        setAlternateCourseTitle("");
      }
    } catch (err) {
      console.error("Duplicate check failed:", err);
      setDuplicateCodeFound(false);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const addCourse = async (e: FormEvent) => {
    e.preventDefault();

    setFormError(null);
    setFormSuccess(null);

    if (!courseCode.trim() || !courseTitle.trim()) {
      setFormError("Course code and course title are required.");
      return;
    }

    try {
      setFormSubmitting(true);

      await apiFetch(`/api/faculty/courses`, {
        method: "POST",
        body: JSON.stringify({
          courseCode: formatCourseCode(courseCode),
          courseName: courseTitle.trim(),
          alternateCourseTitle: duplicateCodeFound
            ? alternateCourseTitle.trim()
            : "",
          major: selectedMajor,
          skillNames: parseSkillNames(courseSkills),
          competencyIds: selectedCompetencyIds,
        }),
      });

      setCourseCode("");
      setCourseTitle("");
      setAlternateCourseTitle("");
      setCourseSkills("");
      setSelectedCompetencyIds([]);
      setDuplicateCodeFound(false);
      setPrefixError(null);
      setFormSuccess("Course added successfully.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Add course failed:", err);
      setFormError(err instanceof Error ? err.message : "Failed to add course");
    } finally {
      setFormSubmitting(false);
    }
  };

  const isSubmitDisabled =
    formSubmitting ||
    checkingDuplicate ||
    !selectedMajor.trim() ||
    !courseCode.trim() ||
    !courseTitle.trim() ||
    !!prefixError ||
    (duplicateCodeFound && !alternateCourseTitle.trim());

  // ── Fetch faculty's courses and unassigned courses in parallel ────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("status", completionFilter);

        const [data, unassigned] = await Promise.all([
          apiFetch<FacultyCourseRow[]>(
            `/api/faculty/courses?${params.toString()}`,
          ),
          apiFetch<FacultyCourseRow[]>(
            `/api/faculty/unassigned-courses?${params.toString()}`,
          ),
        ]);

        if (!cancelled) {
          setRows(data);
          setUnassignedRows(unassigned);
        }
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
  }, [completionFilter, refreshKey]);

  // ── Majors for add form ───────────────────────────────────────────────────
  useEffect(() => {
    const majors = schools.flatMap((school) =>
      school.majors.map((m) => m.name),
    );
    setFormMajors(majors);

    if (majors.length > 0 && !majors.includes(selectedMajor)) {
      setSelectedMajor(majors[0]);
    }
  }, [schools, selectedMajor]);

  // ── Fetch competencies for add form ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch<{ competencies?: SkillOption[] }>(
          `/api/faculty/skills-options`,
        );

        const competencies = Array.isArray(data?.competencies)
          ? data.competencies
          : [];

        if (!cancelled) {
          setCompetencyOptions(competencies);
        }
      } catch (err) {
        console.error("Failed to load competencies:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close modal when filter changes
  useEffect(() => {
    setEditing(null);
  }, [completionFilter, schoolFilter, majorFilter]);

  // Only offer schools and majors that have courses in either table
  const { availableSchools, availableMajors } = useMemo(() => {
    const all = [...rows, ...unassignedRows];
    const schoolIds = new Set(all.flatMap((r) => r.schoolIds));
    const majorIds = new Set(all.flatMap((r) => r.majorIds));
    return {
      availableSchools: schools.filter((s) => schoolIds.has(s.id)),
      availableMajors: (
        schools.find((s) => String(s.id) === schoolFilter)?.majors ?? []
      ).filter((m) => majorIds.has(m.id)),
    };
  }, [rows, unassignedRows, schools, schoolFilter]);

  // Apply school + major filters client-side to both tables
  const matchesFilters = (r: FacultyCourseRow) => {
    if (majorFilter) return r.majorIds.includes(Number(majorFilter));
    if (schoolFilter) return r.schoolIds.includes(Number(schoolFilter));
    return true;
  };

  const filteredRows = useMemo(
    () => rows.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, schoolFilter, majorFilter],
  );

  const filteredUnassignedRows = useMemo(
    () => unassignedRows.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unassignedRows, schoolFilter, majorFilter],
  );

  const [showAddCourseMappingModal, setShowAddCourseMappingModal] =
    useState(false);
  const handleAddCourse = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log("BUTTON CLICKED");
    setShowAddCourseMappingModal(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-dashboard">
      <Navbar />

      <div className="admin-content">
        <section className="admin-header">
          <h1 className="admin-title">Faculty Dashboard</h1>
          <p className="admin-subtitle">Manage your course mappings.</p>
        </section>

        {/* Filter bar */}
        <section className="admin-filter-bar">
          <div className="filter-left">
            <span className="filter-icon" aria-hidden="true">
              <i className="bi bi-funnel"></i>
            </span>

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

            <div className="filter-inline">
              <label className="filter-label" htmlFor="school-select">
                School:
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
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="major-select">
                Major:
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
          </div>
          <button
            onClick={handleAddCourse}
            type="button"
            className="faculty-submit-button btn-add-course"
          >
            Add Course
          </button>
        </section>

        {/* Loading */}
        {loading && (
          <section className="admin-table-card">
            <div className="muted" style={{ padding: 16 }}>
              Loading courses…
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="admin-table-card">
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>Couldn't load courses.</div>
              <div className="muted">{error}</div>
            </div>
          </section>
        )}

        {/* Table */}
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
                    <div className="admin-cell admin-cell-course">
                      <div className="course-code">{row.course}</div>

                      {(row.altName || row.courseName) && (
                        <div
                          className="course-name"
                          style={{
                            fontSize: "0.78rem",
                            color: "#64748b",
                            marginTop: 2,
                          }}
                        >
                          {row.altName || row.courseName}
                        </div>
                      )}
                    </div>
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
                    ? ([...rows, ...unassignedRows].find(
                        (r) => r.id === editing.id,
                      )?.professor ?? "")
                    : ""
                }
                major={
                  editing
                    ? ([...rows, ...unassignedRows].find(
                        (r) => r.id === editing.id,
                      )?.major ?? "")
                    : ""
                }
                onClose={() => setEditing(null)}
                onSaved={() => setRefreshKey((k) => k + 1)}
                apiFetch={apiFetch}
                mappingBasePath="/api/faculty"
                isAdmin={false}
              />

              {filteredRows.length === 0 && (
                <div className="admin-table-row admin-empty-row">
                  <div className="admin-cell" style={{ gridColumn: "1 / 5" }}>
                    <span className="muted">
                      No courses match the selected filter.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Unassigned Courses */}
        {!loading && !error && (
          <section className="admin-table-card" style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={() => setUnassignedOpen((o) => !o)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: unassignedOpen ? "#f8fafc" : "#ffffff",
                border: "none",
                borderBottom: unassignedOpen ? "1px solid #e2e8f0" : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 0.2s ease",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#f1f5f9")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = unassignedOpen
                  ? "#f8fafc"
                  : "#ffffff")
              }
            >
              <span
                style={{
                  fontWeight: 600,
                  color: "#1e293b",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                Unassigned Courses
                {filteredUnassignedRows.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      background: "#e2e8f0",
                      color: "#475569",
                      padding: "4px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {filteredUnassignedRows.length} available
                  </span>
                )}
              </span>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#64748b",
                  fontWeight: 500,
                  fontSize: "0.9rem",
                }}
              >
                <span>{unassignedOpen ? "Hide" : "Show"}</span>
                <i
                  className={`bi bi-chevron-${unassignedOpen ? "up" : "down"}`}
                  style={{
                    color: "#475569",
                    fontSize: "1.2rem",
                    strokeWidth: "1px",
                  }}
                />
              </div>
            </button>

            {unassignedOpen && (
              <div className="admin-table">
                <div className="admin-table-row admin-table-header">
                  <div className="admin-cell admin-cell-course">Course</div>
                  <div className="admin-cell admin-cell-professor">
                    Professor
                  </div>
                  <div className="admin-cell admin-cell-skills">Skills</div>
                  <div className="admin-cell admin-cell-competencies">
                    Competencies
                  </div>
                </div>

                {filteredUnassignedRows.map((row) => (
                  <div className="admin-table-row" key={row.id}>
                    <div className="admin-cell admin-cell-course">
                      <div className="course-code">{row.course}</div>

                      {(row.altName || row.courseName) && (
                        <div
                          className="course-name"
                          style={{
                            fontSize: "0.78rem",
                            color: "#64748b",
                            marginTop: 2,
                          }}
                        >
                          {row.altName || row.courseName}
                        </div>
                      )}
                    </div>
                    <div className="admin-cell admin-cell-professor">
                      <button
                        type="button"
                        className="btn-claim-course"
                        onClick={async () => {
                          try {
                            await apiFetch(
                              `/api/faculty/courses/${row.id}/claim`,
                              { method: "PUT" },
                            );
                            setRefreshKey((k) => k + 1);
                          } catch (err) {
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Failed to claim course",
                            );
                          }
                        }}
                      >
                        I Teach This Course
                      </button>
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
                      </div>
                    </div>
                  </div>
                ))}

                {filteredUnassignedRows.length === 0 && (
                  <div className="admin-table-row admin-empty-row">
                    <div className="admin-cell" style={{ gridColumn: "1 / 5" }}>
                      <span className="muted">
                        No unassigned courses match the selected filter.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <AddCourseMappingModal
        isOpen={showAddCourseMappingModal}
        onClose={() => setShowAddCourseMappingModal(false)}
        onSaved={() => {
          setShowAddCourseMappingModal(false);
          setRefreshKey((k) => k + 1);
        }}
      />
      <Footer />
    </div>
  );
};

export default FacultyDashboard;
