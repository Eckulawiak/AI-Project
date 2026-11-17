// Resume page: pick classes and projects, generate bullet points one block
// per course or project (REQ-RES-2), regenerate any single block
// (REQ-RES-5), edit bullets inline and save the draft (REQ-RES-4).
// Grades and personal identifiers are stripped on the server (REQ-RES-8).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import ResumeProjects from "./components/ResumeProjects";
import CareerGoalsInput from "./components/CareerGoalsInput";
import { apiClient } from "./services/apiClient";
import { getProjects, type StudentProject } from "./services/projectsApi";
import {
  generateBlocks,
  getDraft,
  getResumeOptions,
  saveDraft,
  type BlockKind,
  type DraftBlock,
  type GeneratedBlock,
} from "./services/resumeApi";
import { CLASS_YEARS, type StudentProfile } from "./career/careerData";
import "./studentDashboard.css";
import "./ResumePage.css";

interface ClassOption {
  courseCode: string;
  courseName: string;
  offerings: { id: string; altName: string | null }[];
}

type BlockStatus = "ready" | "loading" | "error";
interface UiBullet {
  id: number;
  text: string;
  edited: boolean;
}
interface UiBlock {
  key: string;
  kind: BlockKind;
  refId: number;
  heading: string;
  bullets: UiBullet[];
  status: BlockStatus;
  error?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const keyOf = (kind: BlockKind, id: number) => `${kind}:${id}`;
const yearLabel = (y: string | null) => CLASS_YEARS.find((c) => c.id === y)?.label;

// What gets saved, and what "unsaved changes" compares against.
const toDraft = (blocks: UiBlock[]): DraftBlock[] =>
  blocks
    .filter((b) => b.status === "ready")
    .map(({ key, kind, refId, heading, bullets }) => ({
      key,
      kind,
      refId,
      heading,
      bullets: bullets
        .map((x) => ({ text: x.text.trim(), edited: x.edited }))
        .filter((x) => x.text),
    }));

// Shows its children only after a second, so quick replies don't flash a
// spinner (REQ-PERF-1: loading indicator after 1 s).
const AfterOneSecond: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 1000);
    return () => window.clearTimeout(t);
  }, []);
  return show ? <>{children}</> : null;
};

// A textarea that grows with its text.
const BulletInput: React.FC<{
  id: string;
  value: string;
  label: string;
  onChange: (text: string) => void;
}> = ({ id, value, label, onChange }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      className="rp-bullet-input"
      rows={1}
      value={value}
      aria-label={label}
      maxLength={400}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

const ResumePage: React.FC = () => {
  const nextId = useRef(1);
  const bullet = (text: string, edited = false): UiBullet => ({
    id: nextId.current++,
    text,
    edited,
  });

  // who the resume is for
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState("");

  // what to include
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classQuery, setClassQuery] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({}); // course code -> offering id
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [projectTitles, setProjectTitles] = useState<Record<number, string>>({});
  const [goals, setGoals] = useState<string[]>([""]);

  // the resume
  const [blocks, setBlocks] = useState<UiBlock[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);

  // --- load: profile, completed courses, saved draft ---
  useEffect(() => {
    getResumeOptions()
      .then(({ profile, completedCourseIds }) => {
        setProfile(profile);
        setCompleted(new Set(completedCourseIds));
        if (profile.careerGoal) setGoals((g) => (g.some((x) => x.trim()) ? g : [profile.careerGoal!]));
      })
      .catch((e) => setLoadError(errorText(e)));

    getDraft()
      .then((draft) => {
        setBlocks(
          draft.blocks.map((b) => ({
            ...b,
            bullets: b.bullets.map((x) => bullet(x.text, x.edited)),
            status: "ready" as const,
          })),
        );
        setSavedSnapshot(JSON.stringify(draft.blocks));
        setSavedAt(draft.updatedAt);
      })
      .catch((e) => setSaveError(`Couldn't load your saved resume. ${errorText(e)}`));

    getProjects()
      .then((ps: StudentProject[]) =>
        setProjectTitles(Object.fromEntries(ps.map((p) => [p.id, p.title]))),
      )
      .catch(() => {});
  }, []);

  // --- the classes in the student's major, completed ones picked ---
  useEffect(() => {
    if (!profile?.majorId) return;
    setClassesLoading(true);
    apiClient<ClassOption[]>(`/courses/majors/${profile.majorId}`)
      .then((list) => {
        const items = Array.isArray(list) ? list : [];
        setClasses(items);
        setPicked((prev) => {
          const next = { ...prev };
          for (const c of items) {
            const done = c.offerings.find((o) => completed.has(Number(o.id)));
            if (done && !next[c.courseCode]) next[c.courseCode] = done.id;
          }
          return next;
        });
      })
      .catch(() => setClasses([]))
      .finally(() => setClassesLoading(false));
  }, [profile?.majorId, completed]);

  const isCompleted = useCallback(
    (c: ClassOption) => c.offerings.some((o) => completed.has(Number(o.id))),
    [completed],
  );

  const visibleClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    return classes
      .filter((c) => !q || `${c.courseCode} ${c.courseName}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(isCompleted(b)) - Number(isCompleted(a)) ||
          a.courseCode.localeCompare(b.courseCode),
      );
  }, [classes, classQuery, isCompleted]);

  const inResume = useMemo(() => new Set(blocks.map((b) => b.key)), [blocks]);
  const courseKey = (c: ClassOption) =>
    picked[c.courseCode] ? keyOf("course", Number(picked[c.courseCode])) : null;
  const courseHeading = (offeringId: number) => {
    const c = classes.find((x) => x.offerings.some((o) => Number(o.id) === offeringId));
    return c ? `${c.courseCode}: ${c.courseName}` : "Class";
  };

  // Picked but not on the resume yet: what "Generate" will write.
  const newCourseIds = classes
    .map((c) => (picked[c.courseCode] ? Number(picked[c.courseCode]) : null))
    .filter((id): id is number => id != null && !inResume.has(keyOf("course", id)));
  const newProjectIds = [...projectIds].filter((id) => !inResume.has(keyOf("project", id)));
  const newCount = newCourseIds.length + newProjectIds.length;
  const anyLoading = blocks.some((b) => b.status === "loading");

  const careerGoals = () => goals.map((g) => g.trim()).filter(Boolean);

  const fromServer = (g: GeneratedBlock, fallbackHeading: string): UiBlock => ({
    key: g.key,
    kind: g.kind,
    refId: g.refId,
    heading: g.heading || fallbackHeading,
    bullets: g.bullets.map((t) => bullet(t)),
    status: g.error ? "error" : "ready",
    error: g.error,
  });

  const headingFor = (kind: BlockKind, id: number) =>
    kind === "course" ? courseHeading(id) : (projectTitles[id] ?? "Project");

  // --- generate new sections (REQ-RES-2) ---
  const generateNew = async () => {
    if (newCount === 0) return;
    const pending: UiBlock[] = [
      ...newCourseIds.map((id) => ({ kind: "course" as const, id })),
      ...newProjectIds.map((id) => ({ kind: "project" as const, id })),
    ].map(({ kind, id }) => ({
      key: keyOf(kind, id),
      kind,
      refId: id,
      heading: headingFor(kind, id),
      bullets: [],
      status: "loading",
    }));
    setBlocks((bs) => [...bs, ...pending]);

    try {
      const { blocks: made } = await generateBlocks({
        courseIds: newCourseIds,
        projectIds: newProjectIds,
        careerGoals: careerGoals(),
      });
      const byKey = new Map(made.map((g) => [g.key, g]));
      setBlocks((bs) =>
        bs.map((b) => {
          const g = byKey.get(b.key);
          if (b.status !== "loading" || !pending.some((p) => p.key === b.key)) return b;
          return g
            ? fromServer(g, b.heading)
            : { ...b, status: "error", error: "Couldn't generate bullet points. Try again." };
        }),
      );
    } catch (e) {
      const msg = errorText(e);
      setBlocks((bs) =>
        bs.map((b) =>
          pending.some((p) => p.key === b.key) ? { ...b, status: "error", error: msg } : b,
        ),
      );
    }
  };

  // --- regenerate or retry one block: only that block is sent (REQ-RES-5) ---
  const regenerate = async (key: string) => {
    const target = blocks.find((b) => b.key === key);
    if (!target) return;
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, status: "loading", error: undefined } : b)));
    try {
      const { blocks: made } = await generateBlocks({
        courseIds: target.kind === "course" ? [target.refId] : [],
        projectIds: target.kind === "project" ? [target.refId] : [],
        careerGoals: careerGoals(),
      });
      const g = made.find((x) => x.key === key);
      setBlocks((bs) =>
        bs.map((b) => {
          if (b.key !== key) return b;
          if (!g) return { ...b, status: "error", error: "Couldn't generate bullet points. Try again." };
          // A failed regenerate keeps the bullets the student already had.
          if (g.error) return { ...b, status: b.bullets.length ? "ready" : "error", error: g.error };
          return fromServer(g, b.heading);
        }),
      );
    } catch (e) {
      const msg = errorText(e);
      setBlocks((bs) =>
        bs.map((b) =>
          b.key === key ? { ...b, status: b.bullets.length ? "ready" : "error", error: msg } : b,
        ),
      );
    }
  };

  // --- edit (REQ-RES-4) ---
  const updateBlock = (key: string, fn: (b: UiBlock) => UiBlock) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? fn(b) : b)));
  const editBullet = (key: string, id: number, text: string) =>
    updateBlock(key, (b) => ({
      ...b,
      bullets: b.bullets.map((x) => (x.id === id ? { ...x, text, edited: true } : x)),
    }));
  const removeBullet = (key: string, id: number) =>
    updateBlock(key, (b) => ({ ...b, bullets: b.bullets.filter((x) => x.id !== id) }));
  const addBullet = (key: string) =>
    updateBlock(key, (b) => ({ ...b, bullets: [...b.bullets, bullet("", true)] }));
  const removeBlock = (key: string) => setBlocks((bs) => bs.filter((b) => b.key !== key));
  const moveBlock = (key: string, by: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  // --- save ---
  const draft = toDraft(blocks);
  const dirty = JSON.stringify(draft) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await saveDraft(draft);
      setSavedSnapshot(JSON.stringify(saved.blocks));
      setSavedAt(saved.updatedAt);
    } catch (e) {
      setSaveError(`Couldn't save your resume. ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const copyAll = async () => {
    const text = draft
      .map((b) => [b.heading, ...b.bullets.map((x) => `• ${x.text}`)].join("\n"))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError("Couldn't copy. Select the text and copy it instead.");
    }
  };

  const who = profile
    ? [
        profile.major,
        profile.classYear && yearLabel(profile.classYear),
        profile.careerGoal && `Goal: ${profile.careerGoal}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="dashboard-page">
      <Navbar />

      <main className="dashboard-main rp-main">
        <section className="rp-head">
          <div>
            <h1 className="dashboard-title">Resume Builder</h1>
            <p className="dashboard-subtitle">
              {profile?.firstName ? `${profile.firstName}'s resume bullet points` : "Your resume bullet points"}
              {who && <span className="rp-who"> · {who}</span>}
            </p>
          </div>
          <div className="rp-save">
            <span className="rp-save-status" role="status">
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : savedAt
                    ? `Saved ${new Date(savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                    : ""}
            </span>
            <button
              type="button"
              className="btn-generate"
              onClick={save}
              disabled={!dirty || saving || anyLoading}
            >
              Save
            </button>
          </div>
        </section>

        {loadError && (
          <p className="rp-alert" role="alert">
            <i className="bi bi-exclamation-circle" /> Couldn't load your profile. {loadError}
          </p>
        )}
        {saveError && (
          <p className="rp-alert" role="alert">
            <i className="bi bi-exclamation-circle" /> {saveError}
          </p>
        )}

        <div className="rp-layout">
          {/* ---------------- what to include ---------------- */}
          <section className="rp-panel" aria-labelledby="rp-include-title">
            <h2 id="rp-include-title" className="card-title">
              What to include
            </h2>

            <div className="card-row">
              <span className="field-label">Classes</span>
              {!profile?.majorId ? (
                <p className="ri-hint">
                  <Link to="/skill-assessment">Add your major</Link> to see your classes here.
                </p>
              ) : (
                <>
                  <p className="ri-hint">
                    Classes you've completed are picked for you.
                    {profile.major ? ` Showing ${profile.major}.` : ""}
                  </p>
                  {classes.length > 8 && (
                    <input
                      id="rp-class-search"
                      className="ri-input rp-search"
                      placeholder="Search classes"
                      aria-label="Search classes"
                      value={classQuery}
                      onChange={(e) => setClassQuery(e.target.value)}
                    />
                  )}
                  {classesLoading && <p className="ri-hint">Loading classes…</p>}
                  <ul className="rp-class-list">
                    {visibleClasses.map((c) => {
                      const key = courseKey(c);
                      const added = key != null && inResume.has(key);
                      const checked = !!picked[c.courseCode];
                      return (
                        <li key={c.courseCode} className="rp-class">
                          <label className="rp-class-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={added}
                              onChange={() =>
                                setPicked((p) => {
                                  const next = { ...p };
                                  if (next[c.courseCode]) delete next[c.courseCode];
                                  else next[c.courseCode] = c.offerings[0]!.id;
                                  return next;
                                })
                              }
                            />
                            <span>
                              <strong>{c.courseCode}</strong> {c.courseName}
                            </span>
                          </label>
                          {isCompleted(c) && <span className="rp-tag">Completed</span>}
                          {added && <span className="rp-tag rp-tag-in">On resume</span>}
                          {checked && !added && c.offerings.length > 1 && (
                            <select
                              className="rp-version"
                              aria-label={`${c.courseCode} version`}
                              value={picked[c.courseCode]}
                              onChange={(e) =>
                                setPicked((p) => ({ ...p, [c.courseCode]: e.target.value }))
                              }
                            >
                              {c.offerings.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.altName || "Standard"}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {!classesLoading && classes.length === 0 && (
                    <p className="ri-hint">No classes are listed for your major yet.</p>
                  )}
                </>
              )}
            </div>

            <ResumeProjects
              selectedIds={projectIds}
              onToggle={(id) =>
                setProjectIds((s) => {
                  const next = new Set(s);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onAdded={(id) => {
                setProjectIds((s) => new Set(s).add(id));
                getProjects()
                  .then((ps) => setProjectTitles(Object.fromEntries(ps.map((p) => [p.id, p.title]))))
                  .catch(() => {});
              }}
              onDeleted={(id) =>
                setProjectIds((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                })
              }
            />

            <CareerGoalsInput goals={goals} onChange={setGoals} />

            <button
              type="button"
              className="btn-generate rp-generate"
              onClick={generateNew}
              disabled={newCount === 0 || anyLoading}
            >
              <i className="bi bi-stars" aria-hidden="true" />{" "}
              {newCount === 0
                ? "Pick a class or project to add"
                : `Write bullet points for ${newCount} ${newCount === 1 ? "item" : "items"}`}
            </button>
            <p className="ri-hint rp-privacy">
              <i className="bi bi-shield-lock" aria-hidden="true" /> Only your classes' skills,
              your projects and your goals are sent to the AI. Grades and personal details never
              are.
            </p>
          </section>

          {/* ---------------- the resume ---------------- */}
          <section className="rp-panel rp-resume" aria-labelledby="rp-resume-title">
            <div className="rp-resume-head">
              <h2 id="rp-resume-title" className="card-title">
                Your resume
              </h2>
              <button
                type="button"
                className="btn-export"
                onClick={copyAll}
                disabled={draft.length === 0}
              >
                <i className="bi bi-clipboard" aria-hidden="true" /> {copied ? "Copied" : "Copy all"}
              </button>
            </div>

            {blocks.length === 0 && (
              <p className="placeholder-text rp-empty">
                Pick classes or projects on the left and click <strong>Write bullet points</strong>.
                Each class and project gets its own section that you can edit or regenerate.
              </p>
            )}

            {blocks.map((b, i) => (
              <article key={b.key} className={`rp-block ${b.status}`} aria-busy={b.status === "loading"}>
                <header className="rp-block-head">
                  <div className="rp-block-title">
                    <span className="rp-kind">{b.kind === "course" ? "Class" : "Project"}</span>
                    <h3>{b.heading}</h3>
                  </div>
                  <div className="rp-block-actions">
                    <button
                      type="button"
                      className="rp-icon"
                      aria-label={`Move ${b.heading} up`}
                      disabled={i === 0}
                      onClick={() => moveBlock(b.key, -1)}
                    >
                      <i className="bi bi-arrow-up" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="rp-icon"
                      aria-label={`Move ${b.heading} down`}
                      disabled={i === blocks.length - 1}
                      onClick={() => moveBlock(b.key, 1)}
                    >
                      <i className="bi bi-arrow-down" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="rp-text-btn"
                      disabled={b.status === "loading"}
                      title="Write new bullet points for this section only. Your edits here are replaced."
                      onClick={() => regenerate(b.key)}
                    >
                      <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Regenerate
                    </button>
                    <button
                      type="button"
                      className="rp-icon"
                      aria-label={`Remove ${b.heading}`}
                      disabled={b.status === "loading"}
                      onClick={() => removeBlock(b.key)}
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </button>
                  </div>
                </header>

                {b.status === "loading" && (
                  <AfterOneSecond>
                    <p className="rp-loading" role="status">
                      <span className="rp-spinner" aria-hidden="true" /> Writing bullet points…
                    </p>
                  </AfterOneSecond>
                )}

                {b.error && b.status !== "loading" && (
                  <div className="rp-block-error" role="alert">
                    <span>
                      <i className="bi bi-exclamation-circle" aria-hidden="true" /> {b.error}
                    </span>
                    <button type="button" className="rp-text-btn" onClick={() => regenerate(b.key)}>
                      Retry
                    </button>
                  </div>
                )}

                {b.status !== "loading" && b.bullets.length > 0 && (
                  <ul className="rp-bullets">
                    {b.bullets.map((x, j) => (
                      <li key={x.id} className="rp-bullet">
                        <span className="rp-dot" aria-hidden="true">
                          •
                        </span>
                        <BulletInput
                          id={`rp-bullet-${x.id}`}
                          value={x.text}
                          label={`${b.heading}, bullet ${j + 1}`}
                          onChange={(text) => editBullet(b.key, x.id, text)}
                        />
                        {x.edited && <span className="rp-edited">Edited</span>}
                        <button
                          type="button"
                          className="rp-icon"
                          aria-label={`Delete bullet ${j + 1}`}
                          onClick={() => removeBullet(b.key, x.id)}
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {b.status !== "loading" && (b.status === "ready" || b.bullets.length > 0) && (
                  <button type="button" className="ri-link-btn" onClick={() => addBullet(b.key)}>
                    <i className="bi bi-plus-lg" aria-hidden="true" /> Add a bullet point
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ResumePage;
