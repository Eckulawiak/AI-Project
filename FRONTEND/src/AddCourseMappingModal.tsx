import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import "./AddCourseMappingModal.css";
import { clearSession, loadSession } from "./Session";
import AutofillSkillBox from "./AutofillTextBox";
import { useSchools } from "./hooks/useSchools";

/**
 * Props required to render and operate the modal.
 * apiFetch is injected so auth + headers are centralized elsewhere.
 */
type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type MajorOption = string;

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

export default function AddCourseMappingModal({
  isOpen,
  onClose,
  onSaved,
}: Props) {
  // ── Add Course Form state ────────────────────────────────────────────────
  const MAJOR_PREFIX_MAP: Record<string, string> = {
    Engineering: "ENR",
    "Software Engineering": "SER",
    "Computer Science": "CSC",
    "Mechanical Engineering": "MER",
    "Industrial Engineering": "IER",
    "Civil Engineering": "CER",
  };

  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const [alternateCourseTitle, setAlternateCourseTitle] = useState("");
  const [duplicateCodeFound, setDuplicateCodeFound] = useState(false);

  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseSkills, setCourseSkills] = useState("");

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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

  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>(
    [],
  );
  const [competencyOptions, setCompetencyOptions] = useState<SkillOption[]>([]);

  const [selectedMajor, setSelectedMajor] = useState<MajorOption>(
    "Software Engineering",
  );
  const schools = useSchools();
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const formMajors =
    schools.find((s) => s.id === selectedSchoolId)?.majors.map((m) => m.name) ??
    [];
  const [prefixError, setPrefixError] = useState<string | null>(null);

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

  const isSubmitDisabled =
    formSubmitting ||
    checkingDuplicate ||
    !selectedMajor.trim() ||
    !courseCode.trim() ||
    !courseTitle.trim() ||
    !!prefixError ||
    (duplicateCodeFound && !alternateCourseTitle.trim());

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
      onSaved();

      setCourseCode("");
      setCourseTitle("");
      setAlternateCourseTitle("");
      setCourseSkills("");
      setSelectedCompetencyIds([]);
      setDuplicateCodeFound(false);
      setPrefixError(null);
      setFormSuccess("Course added successfully.");
    } catch (err) {
      console.error("Add course failed:", err);
      setFormError(err instanceof Error ? err.message : "Failed to add course");
    } finally {
      setFormSubmitting(false);
    }
  };

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

  // ── Start on the school that holds the selected major ────────────────────
  useEffect(() => {
    if (schools.length === 0 || selectedSchoolId !== null) return;
    const school =
      schools.find((s) => s.majors.some((m) => m.name === selectedMajor)) ??
      schools[0];
    setSelectedSchoolId(school.id);
    if (!school.majors.some((m) => m.name === selectedMajor)) {
      setSelectedMajor(school.majors[0]?.name ?? "");
    }
  }, [schools, selectedSchoolId, selectedMajor]);

  if (!isOpen) return null;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <section className="card-section">
            <div className="card-surface">
              <h3 className="heading">Add Course</h3>

              <form onSubmit={addCourse} className="add-form">
                <select
                  className="textbox faculty-input"
                  aria-label="School"
                  value={selectedSchoolId ?? ""}
                  onChange={(e) => {
                    const school = schools.find(
                      (s) => s.id === Number(e.target.value),
                    );
                    const newMajor = school?.majors[0]?.name ?? "";
                    setSelectedSchoolId(school?.id ?? null);
                    setSelectedMajor(newMajor);
                    validateCoursePrefix(courseCode, newMajor);
                  }}
                >
                  {schools.length > 0 ? (
                    schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  ) : (
                    <option>Loading...</option>
                  )}
                </select>

                <select
                  aria-label="Major"
                  className="textbox faculty-input"
                  value={selectedMajor}
                  onChange={(e) => {
                    const newMajor = e.target.value;
                    setSelectedMajor(newMajor);
                    validateCoursePrefix(courseCode, newMajor);
                  }}
                >
                  {formMajors.length > 0 ? (
                    formMajors.map((major) => (
                      <option key={major} value={major}>
                        {major}
                      </option>
                    ))
                  ) : (
                    <option>Loading...</option>
                  )}
                </select>

                {duplicateCodeFound && (
                  <div className="form-warning">
                    This course code already exists. Please enter an alternate
                    course title.
                  </div>
                )}

                <input
                  className="textbox faculty-input"
                  type="text"
                  placeholder="Course Code"
                  value={courseCode}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.toUpperCase();
                    setCourseCode(value);
                    validateCoursePrefix(value, selectedMajor);
                  }}
                  onBlur={() => {
                    const formatted = formatCourseCode(courseCode);
                    setCourseCode(formatted);
                    validateCoursePrefix(formatted, selectedMajor);
                    void checkDuplicateCourseCode(formatted);
                  }}
                />
                {prefixError && <div className="form-error">{prefixError}</div>}

                <input
                  className="textbox faculty-input"
                  type="text"
                  placeholder="Course Title"
                  value={courseTitle}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCourseTitle(e.target.value)
                  }
                />

                {duplicateCodeFound && (
                  <input
                    className="textbox faculty-input"
                    type="text"
                    placeholder="Alternate Course Title"
                    value={alternateCourseTitle}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setAlternateCourseTitle(e.target.value)
                    }
                  />
                )}

                <div style={{ marginTop: "12px", fontWeight: 600 }}>
                  Skills & Competencies (Optional)
                </div>

                <AutofillSkillBox
                  value={courseSkills}
                  onChange={setCourseSkills}
                  placeholder="Add Skills"
                />

                <div className="add-competency-checkbox-grid">
                  {competencyOptions.map((competency) => (
                    <label
                      key={competency.Skill_Id}
                      className="competency-checkbox"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompetencyIds.includes(
                          competency.Skill_Id,
                        )}
                        onChange={() => toggleCompetency(competency.Skill_Id)}
                      />
                      <span>{competency.Skill_name}</span>
                    </label>
                  ))}
                </div>

                {formError && <div className="form-error">{formError}</div>}
                {formSuccess && (
                  <div className="form-success">{formSuccess}</div>
                )}

                <button
                  type="submit"
                  className="faculty-submit-button centered-button"
                  disabled={isSubmitDisabled}
                >
                  {formSubmitting ? "Adding..." : "Add Course"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
