// Faculty "Student Reviews" page: students who invited you to rate their
// career skills. Rate each skill from what you've seen in your work with them.
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import {
  CLASS_YEARS,
  RATING_LABELS,
  competencyBlurb,
  type Competency,
} from "./career/careerData";
import {
  getFacultyReviews,
  saveFacultyReview,
  type FacultyReview,
} from "./services/reviewsApi";
import "./components/ProgressStats.css";
import "./RoadmapPage.css";
import "./SkillAssessmentPage.css";
import "./SkillReviews.css";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const yearLabel = (y: string | null) => CLASS_YEARS.find((c) => c.id === y)?.label;

const FacultyReviewsPage: React.FC = () => {
  const [reviews, setReviews] = useState<FacultyReview[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // the review being filled in
  const [openId, setOpenId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFacultyReviews()
      .then((r) => {
        setReviews(r.reviews);
        setCompetencies(r.competencies);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, []);

  const open = (r: FacultyReview) => {
    setOpenId(r.id);
    setRatings({ ...r.ratings });
    setComment(r.comment ?? "");
    setError("");
  };

  const save = async () => {
    if (openId == null) return;
    const missing = competencies.filter((c) => !ratings[String(c.id)]);
    if (missing.length) {
      setError(`Please rate every skill (${missing.length} left).`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveFacultyReview(openId, ratings, comment);
      setReviews((xs) => xs.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
      setOpenId(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const pending = reviews.filter((r) => r.status === "PENDING").length;

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Student Reviews</h1>
            <p className="report-sub">
              Students who asked you to rate their career skills. Rate each one from
              what you've seen in class, advising or other work with them. Only the
              student who invited you sees your review.
            </p>
          </div>
        </section>

        {error && (
          <div className="report-banner error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}

        {!loaded && <p className="report-muted">Loading…</p>}
        {loaded && reviews.length === 0 && (
          <div className="report-banner" role="status">
            <i className="bi bi-info-circle" />
            <span>No students have invited you to review their skills yet.</span>
          </div>
        )}
        {loaded && pending > 0 && (
          <p className="report-muted">
            {pending} review{pending === 1 ? "" : "s"} waiting for you.
          </p>
        )}

        {reviews.map((r) => (
          <section className="report-card" key={r.id} aria-label={`Review for ${r.student.name}`}>
            <div className="sr-review-head">
              <div>
                <h2 className="report-card-title">
                  <i className="bi bi-person" aria-hidden="true" /> {r.student.name}
                </h2>
                <p className="report-group-meta">
                  {[r.student.major, yearLabel(r.student.classYear), r.student.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {r.status === "PENDING" ? (
                <span className="sr-status pending">Needs your review</span>
              ) : (
                <span className="sr-status done">
                  Reviewed {new Date(r.completedAt!).toLocaleDateString()}
                </span>
              )}
            </div>

            {openId !== r.id ? (
              <button
                type="button"
                className={`rm-btn ${r.status === "PENDING" ? "rm-btn-primary" : "rm-btn-ghost"}`}
                onClick={() => open(r)}
              >
                {r.status === "PENDING" ? "Rate skills" : "Edit review"}
              </button>
            ) : (
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
                    rows={3}
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <div className="sr-actions">
                  <button
                    type="button"
                    className="rm-btn rm-btn-ghost"
                    onClick={() => setOpenId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rm-btn rm-btn-primary"
                    disabled={saving}
                    onClick={save}
                  >
                    {saving ? "Saving…" : "Submit review"}
                  </button>
                </div>
              </>
            )}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default FacultyReviewsPage;
