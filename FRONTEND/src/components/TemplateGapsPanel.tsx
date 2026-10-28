// Admin panel for REQ-ROAD-9: majors whose students are getting the general
// (school or university default) roadmap because no template exists yet.
import React, { useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import "./TemplateGapsPanel.css";

interface TemplateGap {
  id: number;
  school: string | null;
  major: string | null;
  goalType: string;
  firstSeenAt: string;
  studentCount: number;
}

const COLLAPSED_ROWS = 5;

const goalLabel = (g: string) => (g === "GRAD" ? "Graduate school" : "Industry");

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const TemplateGapsPanel: React.FC = () => {
  const [gaps, setGaps] = useState<TemplateGap[] | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiClient<TemplateGap[]>("/api/admin/template-gaps")
      .then(setGaps)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load"));
  }, []);

  const rows = gaps ?? [];
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <section className="tg-card" aria-labelledby="tg-title">
      <div className="tg-head">
        <i className="bi bi-signpost-2 tg-icon" aria-hidden="true" />
        <div>
          <h2 id="tg-title" className="tg-title">
            Majors using the general roadmap
            {gaps && gaps.length > 0 && <span className="tg-count">{gaps.length}</span>}
          </h2>
          <p className="tg-sub">
            These students get the shared default roadmap because their major has
            no roadmap template yet. Each row clears once a template is added and a
            student's roadmap is rebuilt.
          </p>
        </div>
      </div>

      {error && <p className="tg-msg tg-error">Couldn't load template gaps. {error}</p>}
      {!error && gaps === null && <p className="tg-msg">Loading…</p>}
      {!error && gaps && gaps.length === 0 && (
        <p className="tg-msg">
          <i className="bi bi-check-circle" /> Every major in use has its own
          roadmap template.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="tg-table" role="table" aria-label="Majors without a roadmap template">
            <div className="tg-row tg-header" role="row">
              <span role="columnheader">Major</span>
              <span role="columnheader">School</span>
              <span role="columnheader">Goal</span>
              <span role="columnheader" className="tg-num">Students</span>
              <span role="columnheader">First seen</span>
            </div>
            {visible.map((g) => (
              <div className="tg-row" role="row" key={g.id}>
                <span role="cell" className="tg-major">{g.major ?? "Unknown major"}</span>
                <span role="cell">{g.school ?? "—"}</span>
                <span role="cell">{goalLabel(g.goalType)}</span>
                <span role="cell" className="tg-num">{g.studentCount}</span>
                <span role="cell">{formatDate(g.firstSeenAt)}</span>
              </div>
            ))}
          </div>
          {rows.length > COLLAPSED_ROWS && (
            <button
              type="button"
              className="tg-more"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
};

export default TemplateGapsPanel;
