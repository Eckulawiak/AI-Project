// Student "Advisor Feedback" page: reviews of your career skills from
// faculty and advisors, next to your own self-ratings.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import { RATING_LABELS, competencyBlurb, type Competency } from "./career/careerData";
import { getMyReviews, type StudentReview } from "./services/reviewsApi";
import "./components/ProgressStats.css";
import "./RoadmapPage.css";
import "./SkillAssessmentPage.css";
import "./SkillReviews.css";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ratingLabel = (r: number | undefined) => (r ? RATING_LABELS[r - 1] : "Not rated");

const SkillReviewsPage: React.FC = () => {
  const [reviews, setReviews] = useState<StudentReview[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [selfRatings, setSelfRatings] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyReviews()
      .then((r) => {
        setReviews(r.reviews);
        setCompetencies(r.competencies);
        setSelfRatings(r.selfRatings);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, []);

  const hasSelfRatings = Object.keys(selfRatings).length > 0;

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Advisor Feedback</h1>
            <p className="report-sub">
              Your professors and advisors can rate your career skills based on what
              they've seen in your work. Their view sits next to your own, so you can
              see where you agree and where to focus.
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

        {loaded && !error && reviews.length === 0 && (
          <div className="report-banner" role="status">
            <i className="bi bi-info-circle" />
            <span>
              No reviews yet. When a professor or advisor reviews your skills, it will
              show up here.
            </span>
          </div>
        )}

        {loaded && reviews.length > 0 && !hasSelfRatings && (
          <div className="report-banner" role="note">
            <i className="bi bi-info-circle" />
            <span>
              <Link to="/skill-assessment">Take the skill assessment</Link> to see your
              own ratings next to your reviewers'.
            </span>
          </div>
        )}

        {reviews.map((r) => (
          <section className="report-card" key={r.id} aria-label={`Review from ${r.reviewer.name}`}>
            <div className="sr-review-head">
              <h2 className="report-card-title">
                <i className="bi bi-person-badge" aria-hidden="true" /> {r.reviewer.name}
              </h2>
              <span className="sr-status done">
                Reviewed {new Date(r.reviewedAt).toLocaleDateString()}
              </span>
            </div>

            <table className="sr-table">
              <thead>
                <tr>
                  <th scope="col">Skill</th>
                  <th scope="col">You</th>
                  <th scope="col">{r.reviewer.name}</th>
                </tr>
              </thead>
              <tbody>
                {competencies.map((c) => {
                  const mine = selfRatings[String(c.id)];
                  const theirs = r.ratings[String(c.id)];
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        {c.name}
                        <span className="sr-blurb">{competencyBlurb(c.name)}</span>
                      </th>
                      <td>{ratingLabel(mine)}</td>
                      <td className={mine && theirs && theirs !== mine ? "sr-diff" : ""}>
                        {ratingLabel(theirs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {r.comment && (
              <blockquote className="sr-comment">
                <i className="bi bi-chat-quote" aria-hidden="true" /> {r.comment}
              </blockquote>
            )}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default SkillReviewsPage;
