import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./footer";
import { useCareerProgress } from "./context/careerProgress";
import {
  CATEGORIES,
  CLASS_YEARS,
  NACE_COMPETENCIES,
  type Category,
  type ClassYear,
  type Milestone,
} from "./mock/careerData";
import "./studentDashboard.css";
import "./RoadmapPage.css";

const yearLabel = (y: ClassYear) => CLASS_YEARS.find((c) => c.id === y)?.label ?? y;
const goalLabel = (g: string) => (g === "GRAD" ? "Graduate school" : "Industry");
const fromAssessment = (m: Milestone) => m.id.startsWith("g-") || m.id.startsWith("x-");

const RoadmapPage: React.FC = () => {
  const { profile, milestones, progress, assessment, toggleMilestone, resetDemo } =
    useCareerProgress();
  const [yearFilter, setYearFilter] = useState<ClassYear | "ALL">("ALL");
  const [mobileTab, setMobileTab] = useState<Category>("COURSE");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = milestones.find((x) => x.id === selectedId) ?? null;
  const total = milestones.length;
  const done = milestones.filter((x) => x.status === "COMPLETE").length;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const visible = (cat: Category) =>
    milestones.filter(
      (x) => x.category === cat && (yearFilter === "ALL" || x.classYear === yearFilter),
    );

  return (
    <div className="dashboard-page">
      <Navbar />

      <main className="dashboard-main roadmap-main">
        <section className="roadmap-header">
          <div>
            <h1 className="dashboard-title roadmap-title">Your Career Roadmap</h1>
            <p className="roadmap-meta">
              {profile.major} · {yearLabel(profile.classYear)} · Goal:{" "}
              {profile.careerGoal} ({goalLabel(profile.goalType)})
            </p>
          </div>
          <div className="roadmap-actions">
            <Link to="/skill-assessment" className="rm-btn rm-btn-primary">
              <i className="bi bi-clipboard-check" />{" "}
              {assessment ? "Retake assessment" : "Take skill assessment"}
            </Link>
            <button type="button" className="rm-btn rm-btn-ghost" onClick={resetDemo}>
              Reset demo
            </button>
          </div>
        </section>

        {!assessment && (
          <div className="roadmap-banner">
            <i className="bi bi-info-circle" />
            <span>
              This is a sample roadmap.{" "}
              <Link to="/skill-assessment">Take the skill assessment</Link> to
              personalize it.
            </span>
          </div>
        )}

        {/* Overall progress + per-category breakdown (REQ-PROG-1, REQ-PROG-6) */}
        <section className="rm-progress-card">
          <div className="rm-progress-top">
            <div>
              <span className="rm-progress-label">Overall career readiness</span>
              <span className="rm-progress-sub">
                {done} of {total} milestones complete
              </span>
            </div>
            <span className="rm-progress-pct">{progress.overall}%</span>
          </div>
          <div
            className="rm-bar"
            role="progressbar"
            aria-valuenow={progress.overall}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall career readiness"
          >
            <div className="rm-bar-fill" style={{ width: `${progress.overall}%` }} />
            {[25, 50, 75].map((t) => (
              <span key={t} className="rm-bar-tick" style={{ left: `${t}%` }} />
            ))}
          </div>
          <div className="rm-cat-row">
            {CATEGORIES.map((c) => {
              const p = progress.byCategory[c.id];
              return (
                <div key={c.id} className="rm-cat-chip">
                  <i className={`bi ${c.icon}`} />
                  <span className="rm-cat-name">{c.label}</span>
                  <span className="rm-cat-pct">{p.pct}%</span>
                  <div className="rm-mini-bar">
                    <div style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Year filter (REQ-ROAD-3) */}
        <div className="rm-year-filter" role="group" aria-label="Filter by class year">
          {[{ id: "ALL" as const, label: "All years" }, ...CLASS_YEARS].map((y) => (
            <button
              key={y.id}
              type="button"
              className={`rm-year-btn ${yearFilter === y.id ? "active" : ""}`}
              aria-pressed={yearFilter === y.id}
              onClick={() => setYearFilter(y.id)}
            >
              {y.label}
            </button>
          ))}
        </div>

        {/* Category tabs, shown on phones only */}
        <div className="rm-tabs" role="tablist">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === c.id}
              className={`rm-tab ${mobileTab === c.id ? "active" : ""}`}
              onClick={() => setMobileTab(c.id)}
            >
              <i className={`bi ${c.icon}`} />
              <span>{c.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        {/* Four category tracks (REQ-ROAD-2, REQ-ROAD-5) */}
        <section className="rm-tracks">
          {CATEGORIES.map((c) => {
            const items = visible(c.id);
            return (
              <div
                key={c.id}
                className={`rm-track ${mobileTab === c.id ? "mobile-active" : ""}`}
              >
                <div className="rm-track-head">
                  <i className={`bi ${c.icon}`} />
                  <h2>{c.label}</h2>
                  <span className="rm-track-pct">{progress.byCategory[c.id].pct}%</span>
                </div>

                {items.length === 0 && (
                  <p className="rm-empty">No milestones for this year.</p>
                )}

                {CLASS_YEARS.map((y) => {
                  const group = items.filter((x) => x.classYear === y.id);
                  if (!group.length) return null;
                  return (
                    <div key={y.id} className="rm-year-group">
                      <h3 className="rm-year-heading">{y.label}</h3>
                      {group.map((ms) => {
                        const isDone = ms.status === "COMPLETE";
                        return (
                          <div
                            key={ms.id}
                            className={`rm-milestone ${isDone ? "done" : ""} ${
                              selectedId === ms.id ? "selected" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="rm-check"
                              aria-label={`${isDone ? "Mark incomplete" : "Mark complete"}: ${ms.name}`}
                              aria-pressed={isDone}
                              onClick={() => toggleMilestone(ms.id)}
                            >
                              {isDone && <i className="bi bi-check-lg" />}
                            </button>
                            <button
                              type="button"
                              className="rm-milestone-body"
                              onClick={() => setSelectedId(ms.id)}
                            >
                              <span className="rm-milestone-name">{ms.name}</span>
                              {fromAssessment(ms) && (
                                <span className="rm-badge">From assessment</span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      </main>

      {/* Milestone detail panel */}
      {selected && (
        <>
          <div className="rm-panel-scrim" onClick={() => setSelectedId(null)} />
          <aside className="rm-panel" aria-label="Milestone details">
            <button
              type="button"
              className="rm-panel-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close details"
            >
              <i className="bi bi-x-lg" />
            </button>
            <span className="rm-panel-cat">
              {CATEGORIES.find((c) => c.id === selected.category)?.label}
            </span>
            <h2 className="rm-panel-title">{selected.name}</h2>
            <p className="rm-panel-desc">{selected.description}</p>

            <dl className="rm-panel-facts">
              <dt>Suggested year</dt>
              <dd>{yearLabel(selected.classYear)}</dd>
              <dt>Status</dt>
              <dd>{selected.status === "COMPLETE" ? "Complete" : "Not started"}</dd>
            </dl>

            {selected.competencyIds.length > 0 && (
              <>
                <h3 className="rm-panel-sub">Builds these NACE competencies</h3>
                <div className="rm-comp-list">
                  {selected.competencyIds.map((id) => (
                    <span key={id} className="rm-comp">
                      {NACE_COMPETENCIES.find((n) => n.id === id)?.name}
                    </span>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              className={`rm-btn ${
                selected.status === "COMPLETE" ? "rm-btn-ghost" : "rm-btn-primary"
              } rm-panel-action`}
              onClick={() => toggleMilestone(selected.id)}
            >
              {selected.status === "COMPLETE" ? "Mark as not complete" : "Mark complete"}
            </button>
          </aside>
        </>
      )}

      <Footer />
    </div>
  );
};

export default RoadmapPage;
