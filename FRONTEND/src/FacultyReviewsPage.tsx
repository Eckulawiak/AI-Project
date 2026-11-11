// Faculty "Student Reviews" page: pick a student and rate their career
// skills from what you've seen in your work with them. The student sees
// your review on their Advisor Feedback page. Starred students ("My
// advisees") stay at the top so faculty can get back to them quickly.
import React, { useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import {
  CLASS_YEARS,
  RATING_LABELS,
  competencyBlurb,
  type Competency,
} from "./career/careerData";
import {
  findStudents,
  getFacultyReviews,
  getFavorites,
  saveFacultyReview,
  starStudent,
  unstarStudent,
  type FacultyReview,
  type ReviewStudent,
} from "./services/reviewsApi";
import "./components/ProgressStats.css";
import "./RoadmapPage.css";
import "./SkillAssessmentPage.css";
import "./SkillReviews.css";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const yearLabel = (y: string | null) => CLASS_YEARS.find((c) => c.id === y)?.label;
const lastName = (s: ReviewStudent) => s.name.trim().split(/\s+/).pop() ?? "";
const studentMeta = (s: ReviewStudent) =>
  [s.major, yearLabel(s.classYear), s.email].filter(Boolean).join(" · ");

const FacultyReviewsPage: React.FC = () => {
  const [reviews, setReviews] = useState<FacultyReview[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // students to pick from: your majors, or search results
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<ReviewStudent[]>([]);
  const [majors, setMajors] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  // the student being reviewed
  const [openId, setOpenId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  // starred students ("My advisees"); null until loaded
  const [favorites, setFavorites] = useState<ReviewStudent[] | null>(null);
  const [starring, setStarring] = useState<Set<number>>(new Set());
  // ?student=<id> from the Faculty Dashboard opens that student's review
  const linkedId = useRef<number | null>(
    Number(new URLSearchParams(window.location.search).get("student")) || null,
  );

  useEffect(() => {
    getFavorites()
      .then((r) => setFavorites(r.students))
      .catch((e) => {
        setFavorites([]);
        setError(errorText(e));
      });
  }, []);

  useEffect(() => {
    getFacultyReviews()
      .then((r) => {
        setReviews(r.reviews);
        setCompetencies(r.competencies);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, []);

  // Your majors' students when the box is empty; a search after 2+ letters.
  useEffect(() => {
    const q = query.trim();
    if (q.length === 1) return;
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      findStudents(q)
        .then((r) => {
          if (cancelled) return;
          setStudents(r.students);
          if (!q) setMajors(r.majors);
        })
        .catch((e) => !cancelled && setError(errorText(e)))
        .finally(() => !cancelled && setSearching(false));
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const reviewOf = (studentId: number) => reviews.find((r) => r.student.id === studentId);
  const isFavorite = (studentId: number) =>
    (favorites ?? []).some((f) => f.id === studentId);

  const toggleFavorite = async (student: ReviewStudent) => {
    if (starring.has(student.id)) return;
    const starred = isFavorite(student.id);
    const before = favorites ?? [];
    // update right away; put it back if the save fails
    setFavorites(
      starred
        ? before.filter((f) => f.id !== student.id)
        : [...before, student].sort(
            (a, b) =>
              lastName(a).localeCompare(lastName(b), undefined, { sensitivity: "base" }) ||
              a.name.localeCompare(b.name),
          ),
    );
    setStarring((x) => new Set(x).add(student.id));
    setError("");
    try {
      if (starred) await unstarStudent(student.id);
      else await starStudent(student.id);
    } catch (e) {
      setFavorites(before);
      setError(errorText(e));
    } finally {
      setStarring((x) => {
        const next = new Set(x);
        next.delete(student.id);
        return next;
      });
    }
  };

  const open = (studentId: number) => {
    const existing = reviewOf(studentId);
    setOpenId(studentId);
    setRatings({ ...(existing?.ratings ?? {}) });
    setComment(existing?.comment ?? "");
    setError("");
  };

  const save = async (student: ReviewStudent) => {
    const missing = competencies.filter((c) => !ratings[String(c.id)]);
    if (missing.length) {
      setError(`Please rate every skill (${missing.length} left).`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveFacultyReview(student.id, ratings, comment);
      setReviews((xs) => [
        { ...saved, student },
        ...xs.filter((x) => x.student.id !== student.id),
      ]);
      setOpenId(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (student: ReviewStudent) => (
    <>
      <div className="sa-rating-list">
        {competencies.map((c) => (
          <div key={c.id} className="sa-rating-row">
            <div className="sa-rating-text">
              <strong>{c.name}</strong>
              <span>{competencyBlurb(c.name)}</span>
            </div>
            <div className="sa-seg sa-scale" role="radiogroup" aria-label={c.name}>
              {RATING_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={ratings[String(c.id)] === i + 1}
                  className={ratings[String(c.id)] === i + 1 ? "active" : ""}
                  onClick={() => setRatings({ ...ratings, [String(c.id)]: i + 1 })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="sa-field sr-comment-field">
        <span>Comments for the student (optional)</span>
        <textarea
          id={`review-comment-${student.id}`}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <div className="sr-actions">
        <button type="button" className="rm-btn rm-btn-ghost" onClick={() => setOpenId(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="rm-btn rm-btn-primary"
          disabled={saving}
          onClick={() => save(student)}
        >
          {saving ? "Saving…" : "Save review"}
        </button>
      </div>
    </>
  );

  const renderStudent = (s: ReviewStudent) => {
    const existing = reviewOf(s.id);
    const starred = isFavorite(s.id);
    return (
      <li key={s.id} id={`student-${s.id}`} className="sr-student">
        <div className="sr-review-head">
          <div>
            <strong>{s.name}</strong>
            <p className="report-group-meta">{studentMeta(s)}</p>
          </div>
          <div className="sr-head-side">
            {existing && (
              <span className="sr-status done">
                Reviewed {new Date(existing.reviewedAt).toLocaleDateString()}
              </span>
            )}
            {favorites !== null && (
              <button
                type="button"
                className={`sr-star${starred ? " on" : ""}`}
                aria-pressed={starred}
                aria-label={
                  starred ? `Remove ${s.name} from My advisees` : `Add ${s.name} to My advisees`
                }
                title={starred ? "Remove from My advisees" : "Add to My advisees"}
                disabled={starring.has(s.id)}
                onClick={() => toggleFavorite(s)}
              >
                <i className={`bi ${starred ? "bi-star-fill" : "bi-star"}`} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {openId === s.id ? (
          renderForm(s)
        ) : (
          <button
            type="button"
            className={`rm-btn ${existing ? "rm-btn-ghost" : "rm-btn-primary"}`}
            onClick={() => open(s.id)}
          >
            {existing ? "Edit review" : "Review skills"}
          </button>
        )}
      </li>
    );
  };

  const searchingAll = query.trim().length >= 2;
  // Advisees are listed once, at the top, so a review form never opens twice.
  const favoriteList = favorites ?? [];
  const searchResults = students.filter((s) => !isFavorite(s.id));
  const hiddenMatches = students.length - searchResults.length;
  // reviews for students not already in a list above
  const otherReviews = reviews.filter(
    (r) => !students.some((s) => s.id === r.student.id) && !isFavorite(r.student.id),
  );

  // Coming from "Review" on the Faculty Dashboard: open that advisee.
  useEffect(() => {
    const id = linkedId.current;
    if (!id || !loaded || favorites === null) return;
    linkedId.current = null;
    if (!favorites.some((f) => f.id === id)) return;
    open(id);
    window.requestAnimationFrame(() =>
      document.getElementById(`student-${id}`)?.scrollIntoView({ block: "start" }),
    );
    // open() only reads state that is already loaded here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, favorites]);

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Student Reviews</h1>
            <p className="report-sub">
              Rate a student's career skills from what you've seen in class, advising
              or other work with them. Only that student sees your review, on their
              Advisor Feedback page.
            </p>
          </div>
        </section>

        {error && (
          <div className="report-banner error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}

        <section className="report-card" aria-labelledby="advisees-title">
          <h2 id="advisees-title" className="report-card-title">
            <i className="bi bi-star-fill" aria-hidden="true" /> My advisees
          </h2>
          {favorites === null ? (
            <p className="report-muted">Loading…</p>
          ) : favoriteList.length === 0 ? (
            <p className="report-card-note">
              Star a student below to keep them here, so you can get back to them without
              searching.
            </p>
          ) : (
            <ul className="sr-student-list">{favoriteList.map(renderStudent)}</ul>
          )}
        </section>

        <section className="report-card" aria-labelledby="find-title">
          <h2 id="find-title" className="report-card-title">
            <i className="bi bi-search" aria-hidden="true" /> Find a student
          </h2>
          <label className="sa-field">
            <span>Search by name or email</span>
            <input
              id="student-search"
              type="text"
              value={query}
              placeholder="e.g. Rivera"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="report-card-note">
            {searchingAll
              ? "Searching all students."
              : majors.length > 0
                ? `Students in ${majors.join(", ")}.`
                : "You aren't linked to a major yet, so search for a student by name."}
          </p>
          {searching && <p className="report-muted">Loading…</p>}
          {!searching && students.length === 0 && (searchingAll || majors.length > 0) && (
            <p className="report-muted">No students found.</p>
          )}
          {!searching && hiddenMatches > 0 && (
            <p className="report-muted">
              {hiddenMatches === 1
                ? "1 student here is in My advisees above."
                : `${hiddenMatches} students here are in My advisees above.`}
            </p>
          )}
          {searchResults.length > 0 && (
            <ul className="sr-student-list">{searchResults.map(renderStudent)}</ul>
          )}
        </section>

        {loaded && otherReviews.length > 0 && (
          <section className="report-card" aria-labelledby="mine-title">
            <h2 id="mine-title" className="report-card-title">
              <i className="bi bi-clipboard-check" aria-hidden="true" /> Your other reviews
            </h2>
            <ul className="sr-student-list">
              {otherReviews.map((r) => renderStudent(r.student))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FacultyReviewsPage;
