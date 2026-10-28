// Faculty "Student Progress" page (REQ-PROG-7, REQ-ROAD-8): de-identified
// roadmap progress for the majors a faculty member covers and their schools.
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import { GroupStatsView, Suppressed, TrendsView } from "./components/ProgressStats";
import { getFacultyProgress, type FacultyProgressReport } from "./services/reportsApi";
import "./components/ProgressStats.css";

const FacultyProgressPage: React.FC = () => {
  const [report, setReport] = useState<FacultyProgressReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFacultyProgress()
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load progress"));
  }, []);

  const majors = report?.scope.majors ?? [];
  const majorNames = majors.map((m) => m.name).join(", ");

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Student Progress</h1>
            <p className="report-sub">
              How students in your majors are moving through their career roadmaps.
              Everything here is combined across students; no names or individual
              results are shown, and groups under {report?.minGroupSize ?? 5} students
              stay hidden.
            </p>
          </div>
        </section>

        {error && (
          <div className="report-banner error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>Couldn't load student progress. {error}</span>
          </div>
        )}
        {!error && !report && <p className="report-muted">Loading…</p>}

        {report && report.scope.source === "NONE" && (
          <div className="report-banner" role="status">
            <i className="bi bi-info-circle" />
            <span>
              You aren't linked to any majors yet, so there's nothing to show. Claim the
              courses you teach on your dashboard, or ask an admin to assign you to a
              major.
            </span>
          </div>
        )}

        {report && report.scope.source !== "NONE" && (
          <>
            <div className="report-banner" role="note">
              <i className="bi bi-mortarboard" />
              <span>
                Showing <strong>{majorNames}</strong>
                {report.scope.source === "COURSES"
                  ? ", based on the courses you teach."
                  : ", the majors you're assigned to."}
              </span>
            </div>

            {/* REQ-PROG-7: headline statistics */}
            <section className="report-card" aria-labelledby="overall-title">
              <h2 id="overall-title" className="report-card-title">
                <i className="bi bi-bar-chart-line" aria-hidden="true" />
                {majors.length > 1 ? "Your majors combined" : majors[0]?.name}
              </h2>
              {report.overall && <GroupStatsView stats={report.overall} />}
            </section>

            {/* REQ-ROAD-8: roadmap trends */}
            <section className="report-card" aria-labelledby="trends-title">
              <h2 id="trends-title" className="report-card-title">
                <i className="bi bi-signpost-split" aria-hidden="true" />
                Roadmap milestones
              </h2>
              <p className="report-card-note">
                Share of students who have completed each milestone. Only milestones on
                at least {report.minGroupSize} roadmaps are listed.
              </p>
              {report.trends ? (
                <TrendsView trends={report.trends} />
              ) : (
                <Suppressed min={report.minGroupSize} />
              )}
            </section>

            {majors.length > 1 && (
              <section className="report-card" aria-labelledby="majors-title">
                <h2 id="majors-title" className="report-card-title">
                  <i className="bi bi-collection" aria-hidden="true" /> By major
                </h2>
                <div className="report-grid">
                  {report.majors.map((m) => (
                    <div className="report-group" key={m.id}>
                      <h3 className="report-group-title">{m.name}</h3>
                      <p className="report-group-meta">{m.school ?? ""}</p>
                      <GroupStatsView stats={m.stats} compact />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.schools.length > 0 && (
              <section className="report-card" aria-labelledby="schools-title">
                <h2 id="schools-title" className="report-card-title">
                  <i className="bi bi-building" aria-hidden="true" /> Whole school
                </h2>
                <p className="report-card-note">
                  Every major in your school, for comparison.
                </p>
                <div className="report-grid">
                  {report.schools.map((s) => (
                    <div className="report-group" key={s.id}>
                      <h3 className="report-group-title">{s.name ?? "School"}</h3>
                      <p className="report-group-meta">All majors</p>
                      <GroupStatsView stats={s.stats} compact />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FacultyProgressPage;
