// Student "Advisor Feedback" page: invite a faculty member or advisor to
// rate your career skills, and compare their ratings with your own.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import { RATING_LABELS, competencyBlurb, type Competency } from "./career/careerData";
import {
  cancelInvite,
  getMyReviews,
  inviteReviewer,
  searchReviewers,
  type Reviewer,
  type StudentReview,
} from "./services/reviewsApi";
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

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Reviewer[]>([]);
  const [inviting, setInviting] = useState(false);

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

  // Search faculty as the student types.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchReviewers(query)
        .then((m) => !cancelled && setMatches(m))
        .catch(() => !cancelled && setMatches([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const invite = async (r: Reviewer) => {
    setInviting(true);
    setError("");
    try {
      setReviews(await inviteReviewer(r.id));
      setQuery("");
      setMatches([]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setInviting(false);
    }
  };

  const withdraw = async (id: number) => {
    setError("");
    try {
      await cancelInvite(id);
      setReviews((xs) => xs.filter((x) => x.id !== id));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const invitedIds = new Set(reviews.map((r) => r.reviewer.id));
  const hasSelfRatings = Object.keys(selfRatings).length > 0;

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Advisor Feedback</h1>
            <p className="report-sub">
              Invite a professor or advisor who knows your work to rate your career
              skills. Their view sits next to your own, so you can see where you
              agree and where to focus.
            </p>
          </div>
        </section>

        {error && (
          <div className="report-banner error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}

        <section className="report-card" aria-labelledby="invite-title">
          <h2 id="invite-title" className="report-card-title">
            <i className="bi bi-person-plus" aria-hidden="true" /> Invite a reviewer
          </h2>
          <label className="sa-field">
            <span>Search by name or email</span>
            <input
              type="text"
              value={query}
              placeholder="e.g. Smith"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {matches.length > 0 && (
            <ul className="sr-matches">
              {matches.map((m) => (
                <li key={m.id}>
                  <span>
                    <strong>{m.name}</strong> <span className="report-muted">{m.email}</span>
                  </span>
                  <button
                    type="button"
                    className="rm-btn rm-btn-primary"
                    disabled={inviting || invitedIds.has(m.id)}
                    onClick={() => invite(m)}
                  >
                    {invitedIds.has(m.id) ? "Invited" : "Invite"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && matches.length === 0 && (
            <p className="report-muted">No faculty match that search.</p>
          )}
        </section>

        {!loaded && <p className="report-muted">Loading…</p>}

        {loaded && reviews.length === 0 && (
          <p className="report-muted">You haven't invited anyone yet.</p>
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
              {r.status === "PENDING" ? (
                <span className="sr-status pending">Waiting for their review</span>
              ) : (
                <span className="sr-status done">
                  Reviewed {new Date(r.completedAt!).toLocaleDateString()}
                </span>
              )}
            </div>

            {r.status === "PENDING" ? (
              <button
                type="button"
                className="rm-btn rm-btn-ghost"
                onClick={() => withdraw(r.id)}
              >
                Withdraw invitation
              </button>
            ) : (
              <>
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
              </>
            )}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default SkillReviewsPage;
