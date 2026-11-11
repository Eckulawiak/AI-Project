// "My advisees" on the Faculty Dashboard: the students this faculty member
// starred on the Student Reviews page, with a shortcut to review each one.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CLASS_YEARS } from "../career/careerData";
import {
  getFacultyReviews,
  getFavorites,
  type FacultyReview,
  type ReviewStudent,
} from "../services/reviewsApi";
import "./MyAdviseesPanel.css";

const COLLAPSED_ROWS = 6;

const yearLabel = (y: string | null) => CLASS_YEARS.find((c) => c.id === y)?.label;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const MyAdviseesPanel: React.FC = () => {
  const [advisees, setAdvisees] = useState<ReviewStudent[] | null>(null);
  const [reviews, setReviews] = useState<FacultyReview[]>([]);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getFavorites()
      .then((r) => setAdvisees(r.students))
      .catch((e) => {
        setAdvisees([]);
        setError(e instanceof Error ? e.message : "Couldn't load your advisees.");
      });
    // only used for the "Last reviewed" column; the list works without it
    getFacultyReviews()
      .then((r) => setReviews(r.reviews))
      .catch(() => setReviews([]));
  }, []);

  const rows = advisees ?? [];
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  const lastReviewed = (id: number) => reviews.find((r) => r.student.id === id)?.reviewedAt;

  return (
    <section className="ma-card" aria-labelledby="ma-title">
      <div className="ma-head">
        <i className="bi bi-star-fill ma-icon" aria-hidden="true" />
        <div className="ma-head-text">
          <h2 id="ma-title" className="ma-title">
            My advisees
            {rows.length > 0 && <span className="ma-count">{rows.length}</span>}
          </h2>
          <p className="ma-sub">Students you've starred on the Student Reviews page.</p>
        </div>
        <Link to="/faculty-reviews" className="ma-all">
          Student Reviews <i className="bi bi-arrow-right" aria-hidden="true" />
        </Link>
      </div>

      {advisees === null && <p className="ma-msg">Loading…</p>}
      {error && <p className="ma-msg ma-error">{error}</p>}
      {advisees !== null && !error && rows.length === 0 && (
        <p className="ma-msg">
          No advisees yet. On the <Link to="/faculty-reviews">Student Reviews</Link> page, click
          the star next to a student to add them here.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <ul className="ma-list">
            {visible.map((s) => {
              const reviewed = lastReviewed(s.id);
              return (
                <li key={s.id} className="ma-row">
                  <div className="ma-who">
                    <strong>{s.name}</strong>
                    <span className="ma-meta">
                      {[s.major, yearLabel(s.classYear)].filter(Boolean).join(" · ") || s.email}
                    </span>
                  </div>
                  <span className={`ma-status${reviewed ? " done" : ""}`}>
                    {reviewed ? `Reviewed ${formatDate(reviewed)}` : "Not reviewed yet"}
                  </span>
                  <Link
                    to={`/faculty-reviews?student=${s.id}`}
                    className="ma-review"
                    aria-label={`${reviewed ? "Update review for" : "Review"} ${s.name}`}
                  >
                    {reviewed ? "Update review" : "Review"}
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > COLLAPSED_ROWS && (
            <button type="button" className="ma-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
};

export default MyAdviseesPanel;
