import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { loadSession } from "./Session";
import Footer from "./footer";
import "./studentDashboard.css";
import Navbar from "./Navbar";
import { apiClient } from "./services/apiClient";
import { useSchools } from "./hooks/useSchools";

const getVal = (obj: any, key: string) => {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  if (obj[key.toLowerCase()] !== undefined) return obj[key.toLowerCase()];
  if (obj[key.toUpperCase()] !== undefined) return obj[key.toUpperCase()];
  return undefined;
};

// Used until the student's own major is known
const DEFAULT_MAJOR = "Software Engineering";

type GenerationMode = "skills" | "talkingPoints";

interface CourseOffering {
  id: string;
  altName: string | null;
}

interface ClassOption {
  courseCode: string;
  courseName: string;
  offerings: CourseOffering[];
}

interface Skill {
  Skill_Id: string;
  Skill_Name: string;
  Type: boolean;
}

const StudentDashboard: React.FC = () => {
  const schools = useSchools();
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [majorId, setMajorId] = useState<number | null>(null);
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set());
  const [versionSelections, setVersionSelections] = useState<
    Record<string, string>
  >({});
  const [bullets, setBullets] = useState<string[]>([]);
  const [courseSkills, setCourseSkills] = useState<Record<string, Skill[]>>({});

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showToast, setShowToast] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoadingSkills, setIsLoadingSkills] = useState<boolean>(false);

  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("skills");

  const [majorClasses, setMajorClasses] = useState<ClassOption[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState<boolean>(false);

  const majorsForSchool = useMemo(
    () => schools.find((s) => s.id === schoolId)?.majors ?? [],
    [schools, schoolId],
  );
  const major =
    majorsForSchool.find((m) => m.id === majorId)?.name ?? "this major";

  // 1. PICK A STARTING SCHOOL + MAJOR: the student's own major if set
  useEffect(() => {
    if (schools.length === 0 || majorId !== null) return;

    const pick = (id?: number | null, name?: string) => {
      for (const school of schools) {
        const match = school.majors.find(
          (m) => (id != null && m.id === id) || (!!name && m.name === name),
        );
        if (match) return { schoolId: school.id, majorId: match.id };
      }
      return null;
    };

    (async () => {
      let start = null;
      try {
        const me = await apiClient<{ major?: string; majorId?: number | null }>(
          "/api/auth/me",
        );
        start = pick(me.majorId, me.major);
      } catch {
        // not a student session; fall back to the default below
      }

      start = start ??
        pick(null, DEFAULT_MAJOR) ?? {
          schoolId: schools[0].id,
          majorId: schools[0].majors[0]?.id ?? null,
        };

      setSchoolId(start.schoolId);
      setMajorId(start.majorId);
    })();
  }, [schools, majorId]);

  // 2. FETCH CLASSES FOR THE SELECTED MAJOR
  useEffect(() => {
    if (majorId === null) {
      setMajorClasses([]);
      return;
    }

    let cancelled = false;
    setIsLoadingClasses(true);

    apiClient<ClassOption[]>(`/courses/majors/${majorId}`)
      .then((result) => {
        if (!cancelled) setMajorClasses(Array.isArray(result) ? result : []);
      })
      .catch((err) => {
        console.error("Failed to load classes:", err);
        if (!cancelled) setMajorClasses([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClasses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [majorId]);

  const resetSelections = () => {
    setCheckedCodes(new Set());
    setVersionSelections({});
    setBullets([]);
    setErrorMsg(null);
  };

  const availableClasses = useMemo(() => {
    return majorClasses.map((course) => {
      const hasAlternate = course.offerings.some(
        (o) => o.altName && o.altName.trim() !== "",
      );

      let filteredOfferings = hasAlternate
        ? course.offerings.filter((o) => o.altName && o.altName.trim() !== "")
        : course.offerings;

      filteredOfferings = Array.from(
        new Map(
          filteredOfferings.map((o) => [o.altName?.trim() || "Standard", o]),
        ).values(),
      );

      return { ...course, offerings: filteredOfferings };
    });
  }, [majorClasses]);

  const courseNameByCode = useMemo(() => {
    return availableClasses.reduce<Record<string, string>>((acc, course) => {
      acc[course.courseCode] = course.courseName;
      return acc;
    }, {});
  }, [availableClasses]);

  // 3. LOAD SKILLS WHEN THE CLASSES CHANGE
  useEffect(() => {
    const loadSkillsForClasses = async () => {
      if (!availableClasses || availableClasses.length === 0) {
        setCourseSkills({});
        return;
      }

      setIsLoadingSkills(true);

      try {
        const allOfferingIds = availableClasses
          .flatMap((c) => c.offerings.map((o) => Number(o.id)))
          .filter((n) => !isNaN(n) && n > 0);

        if (allOfferingIds.length === 0) {
          setCourseSkills({});
          setIsLoadingSkills(false);
          return;
        }

        const { data: mappingsData, error: mappingsError } = await supabase
          .from("courses_skill_mapping")
          .select("*")
          .in("course_id", allOfferingIds);

        if (mappingsError) throw mappingsError;

        if (!mappingsData || mappingsData.length === 0) {
          setCourseSkills({});
          return;
        }

        const skillIds = [
          ...new Set(mappingsData.map((m) => getVal(m, "skill_id"))),
        ];

        const { data: skillsData, error: skillsError } = await supabase
          .from("skills")
          .select("*")
          .in("skill_id", skillIds);

        if (skillsError) throw skillsError;

        const allSkills = (skillsData || []).map((s) => ({
          Skill_Id: getVal(s, "skill_id"),
          Skill_Name: getVal(s, "skill_name"),
          Type: getVal(s, "type"),
        }));

        const skillsLookup: Record<string, Skill[]> = {};

        mappingsData.forEach((mapping) => {
          const mCourseId = getVal(mapping, "course_id");
          const mSkillId = getVal(mapping, "skill_id");
          const key = String(mCourseId);

          const skillDetail = allSkills.find(
            (s) => String(s.Skill_Id) === String(mSkillId),
          );

          if (skillDetail) {
            if (!skillsLookup[key]) skillsLookup[key] = [];
            if (
              !skillsLookup[key].some(
                (s) => s.Skill_Id === skillDetail.Skill_Id,
              )
            ) {
              skillsLookup[key].push(skillDetail);
            }
          }
        });

        setCourseSkills(skillsLookup);
      } catch (error: any) {
        console.error("Error loading skills:", error);
        setErrorMsg(
          `Database Error: ${error.message || "Failed to load skills"}`,
        );
      } finally {
        setIsLoadingSkills(false);
      }
    };

    loadSkillsForClasses();
  }, [availableClasses]);

  const toggleCourse = (courseCode: string) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(courseCode)) {
        next.delete(courseCode);
        setVersionSelections((o) => {
          const n = { ...o };
          delete n[courseCode];
          return n;
        });
      } else {
        next.add(courseCode);
      }
      return next;
    });
    setBullets([]);
  };

  const selectVersion = (courseCode: string, offeringId: string) => {
    setVersionSelections((prev) => ({ ...prev, [courseCode]: offeringId }));
    setBullets([]);
  };

  const getResolvedId = (course: ClassOption): string | null => {
    if (!checkedCodes.has(course.courseCode)) return null;
    if (course.offerings.length === 1) return course.offerings[0].id;
    return versionSelections[course.courseCode] ?? null;
  };

  const needsSectionCount = availableClasses.filter(
    (c) => checkedCodes.has(c.courseCode) && getResolvedId(c) === null,
  ).length;

  const generateWithAI = async (
    skillsByClass: Record<string, string[]>,
    mode: GenerationMode,
  ) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const payload = {
        skillsByClass,
        mode,
      };

      const result = await apiClient<{ text: string }>("/api/resume/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const formattedBullets = result.text
        .split("\n")
        .map((line: string) => line.replace(/^[*-]\s*/, "").trim())
        .filter((line: string) => line.length > 0);

      setBullets(formattedBullets);
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      setErrorMsg(
        mode === "skills"
          ? "Failed to generate resume bullet points."
          : "Failed to generate talking points.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    if (!availableClasses || availableClasses.length === 0) {
      setBullets([`No classes are listed for ${major} yet.`]);
      return;
    }

    if (checkedCodes.size === 0) {
      setBullets([
        generationMode === "skills"
          ? "Select at least one class to generate bullet points."
          : "Select at least one class to generate talking points.",
      ]);
      return;
    }

    const skillsByClass: Record<string, string[]> = {};

    availableClasses.forEach((course) => {
      const resolvedId = getResolvedId(course);
      if (!resolvedId) return;

      const skills = courseSkills[resolvedId];
      if (skills && skills.length > 0) {
        skillsByClass[course.courseCode] = skills
          .map((skill) => skill.Skill_Name)
          .filter(Boolean);
      }
    });

    if (Object.keys(skillsByClass).length === 0) {
      setBullets(["No skills found in the database for the selected classes."]);
      return;
    } else {
      generateWithAI(skillsByClass, generationMode);
    }
  };

  const handleCopy = () => {
    if (bullets.length === 0) return;
    navigator.clipboard.writeText(bullets.join("\n"));
    alert(
      generationMode === "skills"
        ? "Bullet points copied to clipboard!"
        : "Talking points copied to clipboard!",
    );
  };

  const handleDownload = () => {
    if (bullets.length === 0) return;
    const text = bullets.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      generationMode === "skills"
        ? "generated-bullet-points.txt"
        : "generated-talking-points.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLoggedInStudentId = (): number => {
    const session = loadSession();

    if (!session) {
      throw new Error("No active session found.");
    }

    if (session.userType !== "Student") {
      throw new Error("Only students can save talking points.");
    }

    const tokenParts = session.token.split(".");
    if (tokenParts.length < 2) {
      throw new Error("Invalid session token.");
    }

    const payload = JSON.parse(atob(tokenParts[1]));
    const studentId = Number(payload.userId);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new Error("Invalid student id in session token.");
    }

    return studentId;
  };

  const parseTalkingPointsByCourse = (
    lines: string[],
  ): Record<string, string[]> => {
    const grouped: Record<string, string[]> = {};
    let currentCourseCode: string | null = null;

    for (const rawLine of lines) {
      const line = String(rawLine ?? "").trim();
      if (!line) continue;

      if (line.endsWith(":")) {
        currentCourseCode = line.replace(/:$/, "").trim();
        if (currentCourseCode && !grouped[currentCourseCode]) {
          grouped[currentCourseCode] = [];
        }
        continue;
      }

      if (!currentCourseCode) continue;
      grouped[currentCourseCode].push(line);
    }

    return grouped;
  };

  const handleSaveTalkingPoints = async () => {
    if (generationMode !== "talkingPoints" || bullets.length === 0) return;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const studentId = getLoggedInStudentId();
      const groupedTalkingPoints = parseTalkingPointsByCourse(bullets);

      const entries = Object.entries(groupedTalkingPoints).filter(
        ([, points]) => points.length > 0,
      );

      if (entries.length === 0) {
        throw new Error("No talking points were found to save.");
      }

      for (const [courseCode, talkingPoints] of entries) {
        const courseName = courseNameByCode[courseCode] ?? courseCode;

        await apiClient("/api/history", {
          method: "POST",
          body: JSON.stringify({
            studentId,
            courseCode,
            courseName,
            talkingPoints,
          }),
        });
      }

      setShowToast(true);

      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error: any) {
      console.error("Save talking points error:", error);
      setErrorMsg(error.message || "Failed to save talking points.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveDisabled =
    generationMode !== "talkingPoints" ||
    bullets.length === 0 ||
    isLoading ||
    isSaving;

  return (
    <div className="dashboard-page">
      <Navbar />

      <main className="dashboard-main">
        <section className="dashboard-title-block">
          <h1 className="dashboard-title">Student Dashboard</h1>
          <p className="dashboard-subtitle">
            Your career services tools, all in one place.
          </p>
        </section>

        <section className="card-section">
          <div className="card-surface">
            <h2 className="card-title">Build Your Schedule</h2>

            <div className="major-row">
              <select
                id="school-select"
                className="major-select"
                aria-label="School"
                value={schoolId ?? ""}
                onChange={(e) => {
                  const newSchoolId = Number(e.target.value);
                  const firstMajor = schools.find((s) => s.id === newSchoolId)
                    ?.majors[0];
                  setSchoolId(newSchoolId);
                  setMajorId(firstMajor?.id ?? null);
                  resetSelections();
                }}
              >
                {schools.length === 0 && <option value="">Loading...</option>}
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="major-row">
              <select
                id="major-select"
                className="major-select"
                aria-label="Major"
                value={majorId ?? ""}
                onChange={(e) => {
                  setMajorId(Number(e.target.value));
                  resetSelections();
                }}
              >
                {majorsForSchool.length === 0 && (
                  <option value="">No majors</option>
                )}
                {majorsForSchool.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="card-row">
              <span className="field-label">Select Classes:</span>

              {isLoadingClasses ? (
                <p
                  className="text-muted"
                  style={{ marginTop: "0.3rem", fontSize: "0.85rem" }}
                >
                  Loading classes...
                </p>
              ) : isLoadingSkills ? (
                <p
                  className="text-muted"
                  style={{ marginTop: "0.3rem", fontSize: "0.85rem" }}
                >
                  Loading skills from database...
                </p>
              ) : availableClasses && availableClasses.length > 0 ? (
                <div className="class-grid">
                  {availableClasses.map((course, index) => {
                    const isChecked = checkedCodes.has(course.courseCode);
                    const hasMany = course.offerings.length > 1;
                    const resolvedId = getResolvedId(course);
                    const needsPick =
                      isChecked && hasMany && resolvedId === null;

                    const firstIndexForCode = availableClasses.findIndex(
                      (c) => c.courseCode === course.courseCode,
                    );
                    const showVersionRow =
                      isChecked && hasMany && firstIndexForCode === index;

                    return (
                      <div
                        key={`${course.courseCode}-${index}`}
                        style={{ display: "contents" }}
                      >
                        <button
                          type="button"
                          className={`class-option-box${isChecked ? " selected" : ""}`}
                          onClick={() => toggleCourse(course.courseCode)}
                        >
                          <div className="class-option-code-row">
                            <span className="class-option-code">
                              {course.courseCode}
                            </span>
                            {needsPick && (
                              <span className="class-option-warning">!</span>
                            )}
                          </div>

                          <div className="class-option-name">
                            {course.courseName}
                          </div>
                        </button>

                        {showVersionRow && (
                          <div className="offering-sub-row">
                            <span className="offering-sub-label">
                              Which version?
                            </span>
                            {course.offerings.map((offering) => {
                              const isSelected =
                                versionSelections[course.courseCode] ===
                                offering.id;

                              return (
                                <button
                                  key={offering.id}
                                  type="button"
                                  className={`offering-pill${isSelected ? " selected" : ""}`}
                                  onClick={() =>
                                    selectVersion(
                                      course.courseCode,
                                      offering.id,
                                    )
                                  }
                                >
                                  {offering.altName ?? "Standard"}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p
                  className="text-muted"
                  style={{ marginTop: "0.3rem", fontSize: "0.85rem" }}
                >
                  No classes found for this major.
                </p>
              )}

              {needsSectionCount > 0 && (
                <p
                  style={{
                    marginTop: "0.75rem",
                    fontSize: "0.8rem",
                    color: "#f59e0b",
                    fontWeight: 600,
                  }}
                >
                  ⚠ {needsSectionCount} selected course
                  {needsSectionCount > 1 ? "s" : ""} still need
                  {needsSectionCount === 1 ? "s" : ""} a version selected before
                  generating.
                </p>
              )}
            </div>

            <div
              className="generate-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                marginTop: "2rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div className="generation-toggle-wrap">
                  <span
                    className={`toggle-label ${
                      generationMode === "skills" ? "active" : ""
                    }`}
                  >
                    Skill Generation
                  </span>

                  <button
                    type="button"
                    className={`generation-toggle ${
                      generationMode === "talkingPoints" ? "is-on" : ""
                    }`}
                    onClick={() => {
                      setGenerationMode((prev) =>
                        prev === "skills" ? "talkingPoints" : "skills",
                      );
                      setBullets([]);
                      setErrorMsg(null);
                    }}
                  >
                    <span className="generation-toggle-track">
                      <span className="generation-toggle-thumb" />
                    </span>
                  </button>

                  <span
                    className={`toggle-label ${
                      generationMode === "talkingPoints" ? "active" : ""
                    }`}
                  >
                    Talking Points
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={`btn-generate ${isLoading ? "btn-loading" : ""}`}
                onClick={handleGenerate}
                disabled={isLoading || isLoadingSkills || needsSectionCount > 0}
              >
                {isLoading
                  ? "Generating..."
                  : generationMode === "skills"
                    ? "Generate Skills with AI"
                    : "Generate Talking Points with AI"}
              </button>
            </div>
          </div>
        </section>

        <section className="card-section">
          <div className="card-surface bullets-card">
            <div className="bullets-header">
              <h2 className="card-title">
                {generationMode === "skills"
                  ? "Generated Bullet Points:"
                  : "Generated Talking Points:"}
              </h2>

              <div
                className="bullets-button"
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <button
                  type="button"
                  className="btn-export"
                  onClick={handleSaveTalkingPoints}
                  disabled={saveDisabled}
                  aria-label="Save generated talking points"
                  style={{
                    opacity: saveDisabled ? 0.5 : 1,
                    cursor: saveDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  className="btn-export"
                  onClick={handleDownload}
                  disabled={bullets.length === 0 || isLoading}
                  aria-label="Download generated content"
                >
                  Export
                </button>

                <button
                  type="button"
                  className="icon-button"
                  onClick={handleCopy}
                  disabled={bullets.length === 0 || isLoading}
                  aria-label="Copy generated content"
                >
                  <i className="bi bi-clipboard"></i>
                </button>
              </div>
            </div>

            <div className="bullets-body">
              {isLoading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p>
                    {generationMode === "skills"
                      ? "Generating bullet points with AI..."
                      : "Generating talking points with AI..."}
                  </p>
                </div>
              ) : errorMsg ? (
                <p className="error-text">{errorMsg}</p>
              ) : bullets.length === 0 ? (
                <p className="placeholder-text">
                  Select classes and click "Generate" to see your AI-generated
                  content.
                </p>
              ) : (
                <ul>
                  {bullets.map((b, idx) =>
                    b.endsWith(":") || b.startsWith("---") ? (
                      <p
                        key={idx}
                        style={{
                          fontWeight: "bold",
                          marginTop: "0.75rem",
                          listStyle: "none",
                        }}
                      >
                        {b}
                      </p>
                    ) : (
                      <li key={idx}>{b}</li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      </main>

      {showToast && (
        <div className="toast-success">Talking points saved successfully!</div>
      )}

      <Footer />
    </div>
  );
};

export default StudentDashboard;
