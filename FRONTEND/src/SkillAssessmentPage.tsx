import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import { useCareerProgress } from "./context/careerProgress";
import {
  CLASS_YEARS,
  MOCK_COURSES,
  MOCK_SCHOOLS,
  NACE_COMPETENCIES,
  RATING_LABELS,
  type ExperienceEntry,
  type StudentProfile,
} from "./mock/careerData";
import "./studentDashboard.css";
import "./RoadmapPage.css";
import "./SkillAssessmentPage.css";

type CourseStatus = "NONE" | "IN_PROGRESS" | "DONE";

const STEPS = ["About you", "Coursework", "Self-rating", "Experience", "Results"];

const EXPERIENCE_KINDS: { id: ExperienceEntry["kind"]; label: string }[] = [
  { id: "INTERNSHIP", label: "Internship" },
  { id: "JOB", label: "Job" },
  { id: "CERT", label: "Certification" },
  { id: "PROJECT", label: "Project" },
];

const SkillAssessmentPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    profile: savedProfile,
    assessment,
    milestones,
    applyAssessment,
  } = useCareerProgress();

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // Pre-fill from the last assessment or the (fake) profile.
  const [profile, setProfile] = useState<StudentProfile>(
    assessment?.profile ?? savedProfile,
  );
  const [courses, setCourses] = useState<Record<string, CourseStatus>>(() => {
    // Start from what the roadmap already shows as complete.
    const doneOnRoadmap = new Set(
      milestones
        .filter((x) => x.courseCode && x.status === "COMPLETE")
        .map((x) => x.courseCode),
    );
    const init: Record<string, CourseStatus> = {};
    for (const c of MOCK_COURSES) {
      init[c.code] = doneOnRoadmap.has(c.code)
        ? "DONE"
        : assessment?.inProgressCourses.includes(c.code)
          ? "IN_PROGRESS"
          : "NONE";
    }
    return init;
  });
  const [ratings, setRatings] = useState<Record<number, number>>(
    assessment?.ratings ?? {},
  );
  const [experience, setExperience] = useState<ExperienceEntry[]>(
    assessment?.experience ?? [],
  );
  const [newKind, setNewKind] = useState<ExperienceEntry["kind"]>("INTERNSHIP");
  const [newTitle, setNewTitle] = useState("");

  const majors = MOCK_SCHOOLS[profile.school] ?? [];

  const validate = (): string => {
    if (step === 0) {
      if (!profile.major) return "Please choose your major.";
      if (!profile.careerGoal.trim()) return "Please enter a career goal.";
    }
    if (step === 2) {
      const missing = NACE_COMPETENCIES.filter((n) => !ratings[n.id]);
      if (missing.length)
        return `Please rate every competency (${missing.length} left).`;
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

  const completed = Object.entries(courses)
    .filter(([, s]) => s === "DONE")
    .map(([c]) => c);
  const inProgress = Object.entries(courses)
    .filter(([, s]) => s === "IN_PROGRESS")
    .map(([c]) => c);

  const strengths = NACE_COMPETENCIES.filter((n) => (ratings[n.id] ?? 0) >= 3);
  const growth = NACE_COMPETENCIES.filter((n) => (ratings[n.id] ?? 0) <= 2);
  const courseSkills = MOCK_COURSES.filter((c) => completed.includes(c.code)).flatMap(
    (c) => c.skills,
  );

  const finish = () => {
    applyAssessment({
      profile,
      completedCourses: completed,
      inProgressCourses: inProgress,
      ratings,
      experience,
      completedAt: new Date().toISOString(),
    });
    navigate("/roadmap");
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
                    value={profile.school}
                    onChange={(e) =>
                      setProfile({ ...profile, school: e.target.value, major: "" })
                    }
                  >
                    {Object.keys(MOCK_SCHOOLS).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Major</span>
                  <select
                    value={profile.major}
                    onChange={(e) => setProfile({ ...profile, major: e.target.value })}
                  >
                    <option value="">Choose a major</option>
                    {majors.map((m) => (
                      <option key={m}>{m}</option>
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
                        classYear: e.target.value as StudentProfile["classYear"],
                      })
                    }
                  >
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
                        setProfile({ ...profile, goalType: g.id as StudentProfile["goalType"] })
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
              <div className="sa-course-list">
                {MOCK_COURSES.map((c) => (
                  <div key={c.code} className="sa-course">
                    <div className="sa-course-info">
                      <strong>{c.code}</strong> {c.name}
                      <div className="sa-skill-tags">
                        {c.skills.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="sa-seg" role="group" aria-label={`${c.code} status`}>
                      {(
                        [
                          ["NONE", "Not taken"],
                          ["IN_PROGRESS", "Taking now"],
                          ["DONE", "Completed"],
                        ] as [CourseStatus, string][]
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          aria-pressed={courses[c.code] === val}
                          className={courses[c.code] === val ? "active" : ""}
                          onClick={() => setCourses({ ...courses, [c.code]: val })}
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
                These are the eight NACE career readiness competencies. Be honest —
                low ratings add helpful milestones to your roadmap.
              </p>
              <div className="sa-rating-list">
                {NACE_COMPETENCIES.map((n) => (
                  <div key={n.id} className="sa-rating-row">
                    <div className="sa-rating-text">
                      <strong>{n.name}</strong>
                      <span>{n.blurb}</span>
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
              <button type="button" className="rm-btn rm-btn-primary" onClick={finish}>
                <i className="bi bi-signpost-split" /> Build my roadmap
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
