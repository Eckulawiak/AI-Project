import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import { useCareerProgress } from "./context/careerProgress";
import { useSchools } from "./hooks/useSchools";
import { getAssessmentOptions, getMyAssessment } from "./services/careerApi";
import {
  CLASS_YEARS,
  RATING_LABELS,
  competencyBlurb,
  type AssessmentCourse,
  type ClassYear,
  type Competency,
  type CourseStatus,
  type ExperienceEntry,
  type GoalType,
} from "./career/careerData";
import "./studentDashboard.css";
import "./RoadmapPage.css";
import "./SkillAssessmentPage.css";

const STEPS = ["About you", "Coursework", "Self-rating", "Experience", "Results"];

const EXPERIENCE_KINDS: { id: ExperienceEntry["kind"]; label: string }[] = [
  { id: "INTERNSHIP", label: "Internship" },
  { id: "JOB", label: "Job" },
  { id: "CERT", label: "Certification" },
  { id: "PROJECT", label: "Project" },
];

interface ProfileForm {
  schoolId: number | null;
  majorId: number | null;
  classYear: ClassYear | "";
  careerGoal: string;
  goalType: GoalType;
}

type ListedExperience = ExperienceEntry & { id: string };

const SkillAssessmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile: savedProfile, submitAssessment } = useCareerProgress();
  const schools = useSchools();

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    schoolId: null,
    majorId: null,
    classYear: "",
    careerGoal: "",
    goalType: "INDUSTRY",
  });
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [courseList, setCourseList] = useState<AssessmentCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courses, setCourses] = useState<Record<number, CourseStatus>>({});
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [experience, setExperience] = useState<ListedExperience[]>([]);
  const [newKind, setNewKind] = useState<ExperienceEntry["kind"]>("INTERNSHIP");
  const [newTitle, setNewTitle] = useState("");

  // Pre-fill from the saved profile once it arrives.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !savedProfile) return;
    setPrefilled(true);
    setProfile((p) => ({
      schoolId: savedProfile.schoolId ?? p.schoolId,
      majorId: savedProfile.majorId ?? p.majorId,
      classYear: savedProfile.classYear ?? p.classYear,
      careerGoal: savedProfile.careerGoal ?? p.careerGoal,
      goalType: savedProfile.goalType ?? p.goalType,
    }));
  }, [savedProfile, prefilled]);

  // ... and ratings and experience from the last assessment.
  useEffect(() => {
    getMyAssessment()
      .then((last) => {
        if (!last) return;
        setRatings(
          Object.fromEntries(
            Object.entries(last.ratings).map(([id, r]) => [Number(id), Number(r)]),
          ),
        );
        setExperience(last.experience.map((e, i) => ({ ...e, id: `saved-${i}` })));
      })
      .catch(() => {});
  }, []);

  // Courses (with mapped skills and saved status) for the chosen major.
  useEffect(() => {
    if (!profile.majorId) {
      setCourseList([]);
      return;
    }
    let cancelled = false;
    setLoadingCourses(true);
    getAssessmentOptions(profile.majorId)
      .then((opts) => {
        if (cancelled) return;
        setCompetencies(opts.competencies);
        setCourseList(opts.courses);
        setCourses((prev) => {
          const next: Record<number, CourseStatus> = {};
          for (const c of opts.courses) next[c.courseId] = prev[c.courseId] ?? c.status;
          return next;
        });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoadingCourses(false));
    return () => {
      cancelled = true;
    };
  }, [profile.majorId]);

  const majors = useMemo(
    () => schools.find((s) => s.id === profile.schoolId)?.majors ?? [],
    [schools, profile.schoolId],
  );

  const validate = (): string => {
    if (step === 0) {
      if (!profile.majorId) return "Please choose your major.";
      if (!profile.classYear) return "Please choose your class year.";
      if (!profile.careerGoal.trim()) return "Please enter a career goal.";
    }
    if (step === 2) {
      const missing = competencies.filter((n) => !ratings[n.id]);
      if (missing.length)
        return `Please rate every skill (${missing.length} left).`;
    }
    return "";
  };

  const next = () => {
    const msg = validate();
    setError(msg);
    if (!msg) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const back = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const addExperience = () => {
    if (!newTitle.trim()) return;
    setExperience((xs) => [
      ...xs,
      { id: String(Date.now()), kind: newKind, title: newTitle.trim() },
    ]);
    setNewTitle("");
  };

  const completed = courseList.filter((c) => courses[c.courseId] === "COMPLETED");
  const inProgress = courseList.filter((c) => courses[c.courseId] === "IN_PROGRESS");

  const strengths = competencies.filter((n) => (ratings[n.id] ?? 0) >= 3);
  const growth = competencies.filter((n) => (ratings[n.id] ?? 0) <= 2);
  const courseSkills = Array.from(new Set(completed.flatMap((c) => c.skills)));

  const finish = async () => {
    if (!profile.majorId || !profile.classYear) return;
    setSaving(true);
    setError("");
    try {
      await submitAssessment({
        profile: {
          majorId: profile.majorId,
          classYear: profile.classYear,
          careerGoal: profile.careerGoal.trim(),
          goalType: profile.goalType,
        },
        courses: courseList.map((c) => ({
          courseId: c.courseId,
          status: courses[c.courseId] ?? "NONE",
        })),
        ratings: Object.fromEntries(
          Object.entries(ratings).map(([id, r]) => [String(id), r]),
        ),
        experience: experience.map(({ kind, title }) => ({ kind, title })),
      });
      navigate("/roadmap");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your assessment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Navbar />

      <main className="dashboard-main sa-main">
        <section className="dashboard-title-block">
          <h1 className="dashboard-title">Skill Assessment</h1>
          <p className="dashboard-subtitle">
            Takes about 5 minutes. Your answers shape your career roadmap.
          </p>
        </section>

        {/* Step indicator */}
        <ol className="sa-steps" aria-label="Assessment progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`sa-step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="sa-step-dot">
                {i < step ? <i className="bi bi-check-lg" /> : i + 1}
              </span>
              <span className="sa-step-label">{label}</span>
            </li>
          ))}
        </ol>

        <section className="sa-card">
          {step === 0 && (
            <>
              <h2 className="sa-heading">About you</h2>
              <div className="sa-grid">
                <label className="sa-field">
                  <span>School</span>
                  <select
                    value={profile.schoolId ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        schoolId: e.target.value ? Number(e.target.value) : null,
                        majorId: null,
                      })
                    }
                  >
                    <option value="">Choose a school</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Major</span>
                  <select
                    value={profile.majorId ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        majorId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Choose a major</option>
                    {majors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Class year</span>
                  <select
                    value={profile.classYear}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        classYear: e.target.value as ClassYear | "",
                      })
                    }
                  >
                    <option value="">Choose a year</option>
                    {CLASS_YEARS.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Career goal</span>
                  <input
                    type="text"
                    value={profile.careerGoal}
                    placeholder="e.g. Software Engineer"
                    onChange={(e) => setProfile({ ...profile, careerGoal: e.target.value })}
                  />
                </label>
              </div>
              <fieldset className="sa-field sa-goal-type">
                <legend>After graduation I plan to…</legend>
                {[
                  { id: "INDUSTRY", label: "Go straight into a job" },
                  { id: "GRAD", label: "Go to graduate school" },
                ].map((g) => (
                  <label
                    key={g.id}
                    className={`sa-choice ${profile.goalType === g.id ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="goalType"
                      checked={profile.goalType === g.id}
                      onChange={() =>
                        setProfile({ ...profile, goalType: g.id as GoalType })
                      }
                    />
                    {g.label}
                  </label>
                ))}
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="sa-heading">Coursework</h2>
              <p className="sa-help">
                Mark the courses you have finished or are taking now. We use the
                skills your faculty mapped to each course.
              </p>
              {loadingCourses && <p className="sa-empty">Loading your major's courses…</p>}
              {!loadingCourses && courseList.length === 0 && (
                <p className="sa-empty">
                  No courses are listed for this major yet. You can skip this step.
                </p>
              )}
              <div className="sa-course-list">
                {courseList.map((c) => (
                  <div key={c.courseId} className="sa-course">
                    <div className="sa-course-info">
                      <strong>{c.courseCode}</strong> {c.courseName}
                      <div className="sa-skill-tags">
                        {c.mapped ? (
                          [...c.skills, ...c.competencies.map((x) => x.name)].map((s) => (
                            <span key={s}>{s}</span>
                          ))
                        ) : (
                          <span className="sa-unmapped">Skills not mapped yet</span>
                        )}
                      </div>
                    </div>
                    <div className="sa-seg" role="group" aria-label={`${c.courseCode} status`}>
                      {(
                        [
                          ["NONE", "Not taken"],
                          ["IN_PROGRESS", "Taking now"],
                          ["COMPLETED", "Completed"],
                        ] as [CourseStatus, string][]
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          aria-pressed={(courses[c.courseId] ?? "NONE") === val}
                          className={(courses[c.courseId] ?? "NONE") === val ? "active" : ""}
                          onClick={() => setCourses({ ...courses, [c.courseId]: val })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="sa-heading">Rate yourself</h2>
              <p className="sa-help">
                These are eight skills employers look for in every field. Rate
                where you are today. There are no wrong answers, and lower
                ratings add helpful suggestions to your roadmap.
              </p>
              <div className="sa-rating-list">
                {competencies.map((n) => (
                  <div key={n.id} className="sa-rating-row">
                    <div className="sa-rating-text">
                      <strong>{n.name}</strong>
                      <span>{competencyBlurb(n.name)}</span>
                    </div>
                    <div className="sa-seg sa-scale" role="radiogroup" aria-label={n.name}>
                      {RATING_LABELS.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={ratings[n.id] === i + 1}
                          className={ratings[n.id] === i + 1 ? "active" : ""}
                          onClick={() => setRatings({ ...ratings, [n.id]: i + 1 })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="sa-heading">Experience</h2>
              <p className="sa-help">
                Add internships, jobs, certifications or projects you already have.
                This step is optional.
              </p>
              <div className="sa-add-row">
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as ExperienceEntry["kind"])}
                  aria-label="Type"
                >
                  {EXPERIENCE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newTitle}
                  placeholder="e.g. IT Help Desk at QU"
                  aria-label="Title"
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExperience()}
                />
                <button type="button" className="rm-btn rm-btn-primary" onClick={addExperience}>
                  <i className="bi bi-plus-lg" /> Add
                </button>
              </div>
              {experience.length === 0 ? (
                <p className="sa-empty">Nothing added yet.</p>
              ) : (
                <ul className="sa-exp-list">
                  {experience.map((e) => (
                    <li key={e.id}>
                      <span className="sa-exp-kind">
                        {EXPERIENCE_KINDS.find((k) => k.id === e.kind)?.label}
                      </span>
                      <span className="sa-exp-title">{e.title}</span>
                      <button
                        type="button"
                        className="sa-remove"
                        aria-label={`Remove ${e.title}`}
                        onClick={() => setExperience((xs) => xs.filter((x) => x.id !== e.id))}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="sa-heading">Your results</h2>
              <div className="sa-results">
                <div className="sa-result-box strong">
                  <h3>
                    <i className="bi bi-star-fill" /> Strengths
                  </h3>
                  {strengths.length ? (
                    <ul>
                      {strengths.map((n) => (
                        <li key={n.id}>{n.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>None rated Confident or Strong yet.</p>
                  )}
                </div>
                <div className="sa-result-box grow">
                  <h3>
                    <i className="bi bi-graph-up-arrow" /> Room to grow
                  </h3>
                  {growth.length ? (
                    <ul>
                      {growth.map((n) => (
                        <li key={n.id}>{n.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>You rated yourself highly across the board.</p>
                  )}
                </div>
              </div>
              <div className="sa-summary">
                <p>
                  <strong>{completed.length}</strong> courses completed,{" "}
                  <strong>{inProgress.length}</strong> in progress,{" "}
                  <strong>{experience.length}</strong> experience entries.
                </p>
                {courseSkills.length > 0 && (
                  <div className="sa-skill-tags">
                    {courseSkills.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                )}
                <p className="sa-help">
                  Building your roadmap will check off completed courses and
                  experience, and add {growth.length} milestone
                  {growth.length === 1 ? "" : "s"} for your growth areas.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="sa-error" role="alert">
              <i className="bi bi-exclamation-circle" /> {error}
            </p>
          )}

          <div className="sa-nav">
            {step > 0 ? (
              <button type="button" className="rm-btn rm-btn-ghost" onClick={back}>
                <i className="bi bi-arrow-left" /> Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="rm-btn rm-btn-primary" onClick={next}>
                {step === 3 ? "See results" : "Next"} <i className="bi bi-arrow-right" />
              </button>
            ) : (
              <button
                type="button"
                className="rm-btn rm-btn-primary"
                onClick={finish}
                disabled={saving}
              >
                <i className="bi bi-signpost-split" />{" "}
                {saving ? "Building your roadmap…" : "Build my roadmap"}
              </button>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default SkillAssessmentPage;
