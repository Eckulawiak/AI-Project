// Admin "Reports" page (REQ-PROG-8): usage by students and faculty, and
// de-identified roadmap progress across every school.
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import { GroupStatsView, Suppressed, TrendsView } from "./components/ProgressStats";
import {
  REPORT_PERIODS,
  getAdminReport,
  type AdminReport,
  type UsageReport,
} from "./services/reportsApi";
import "./components/ProgressStats.css";

const periodLabel = (d: number) => (d === 365 ? "Last year" : `Last ${d} days`);
const show = (n: number | null) => (n == null ? "—" : n.toLocaleString());

const Tile: React.FC<{ value: number | null; label: string; detail?: string }> = ({
  value,
  label,
  detail,
}) => (
  <div className="usage-tile">
    <span className="usage-tile-value">{show(value)}</span>
    <span className="usage-tile-label">{label}</span>
    {detail && <span className="usage-tile-detail">{detail}</span>}
  </div>
);

// Simple bar chart of logins per day.
const LoginChart: React.FC<{ days: UsageReport["loginsPerDay"] }> = ({ days }) => {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.logins));
  const w = 100 / days.length;
  const total = days.reduce((a, d) => a + d.logins, 0);
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <figure className="login-chart" aria-label={`Logins per day, ${total} in total`}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-hidden="true">
        {days.map((d, i) => {
          const h = (d.logins / max) * 38;
          return (
            <rect
              key={d.date}
              x={i * w + w * 0.15}
              y={40 - h}
              width={w * 0.7}
              height={h}
              fill="#131d43"
              rx={0.4}
            >
              <title>{`${fmt(d.date)}: ${d.logins} logins`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="login-chart-axis">
        <span>{fmt(days[0]!.date)}</span>
        <span>Logins per day (peak {max})</span>
        <span>{fmt(days[days.length - 1]!.date)}</span>
      </div>
    </figure>
  );
};

const AdminReportsPage: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getAdminReport(days)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const u = report?.usage;
  const p = report?.progress;

  return (
    <div className="report-page">
      <Navbar />
      <main className="report-main">
        <section className="report-head">
          <div>
            <h1 className="report-title">Reports</h1>
            <p className="report-sub">
              How students and faculty are using the app, and how roadmap progress
              compares across schools. Progress is combined across students; groups
              under {report?.minGroupSize ?? 5} are hidden.
            </p>
          </div>
          <div className="period-picker" role="group" aria-label="Report period">
            {REPORT_PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                className={days === d ? "active" : ""}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                disabled={loading}
              >
                {periodLabel(d)}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="report-banner error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>Couldn't load reports. {error}</span>
          </div>
        )}
        {!error && !report && <p className="report-muted">Loading…</p>}

        {u && p && (
          <>
            <section className="report-card" aria-labelledby="usage-title">
              <h2 id="usage-title" className="report-card-title">
                <i className="bi bi-people" aria-hidden="true" /> Usage · {periodLabel(u.periodDays).toLowerCase()}
              </h2>
              <div className="usage-grid">
                <Tile
                  value={u.students.active}
                  label="Active students"
                  detail={`of ${show(u.students.total)} · ${show(u.students.logins)} logins`}
                />
                <Tile
                  value={u.faculty.active}
                  label="Active faculty"
                  detail={`of ${show(u.faculty.total)} · ${show(u.faculty.logins)} logins`}
                />
                <Tile
                  value={u.activity.assessmentsCompleted}
                  label="Skill assessments"
                  detail="completed"
                />
                <Tile
                  value={u.activity.milestonesCompleted}
                  label="Milestones completed"
                />
                <Tile
                  value={u.activity.roadmapsGenerated}
                  label="Roadmaps built or refreshed"
                  detail={u.students.withRoadmap != null ? `${show(u.students.withRoadmap)} students have one` : undefined}
                />
                <Tile
                  value={u.activity.talkingPointsSaved}
                  label="Talking points saved"
                />
                <Tile
                  value={u.activity.aiGenerations}
                  label="AI generations"
                  detail={u.activity.aiFailures ? `${show(u.activity.aiFailures)} failed` : undefined}
                />
              </div>
              <LoginChart days={u.loginsPerDay} />
            </section>

            <section className="report-card" aria-labelledby="progress-title">
              <h2 id="progress-title" className="report-card-title">
                <i className="bi bi-bar-chart-line" aria-hidden="true" /> Roadmap progress,
                all schools
              </h2>
              <GroupStatsView stats={p.overall} />
            </section>

            <section className="report-card" aria-labelledby="schools-title">
              <h2 id="schools-title" className="report-card-title">
                <i className="bi bi-building" aria-hidden="true" /> By school
              </h2>
              <div className="school-table" role="table" aria-label="Progress by school">
                <div className="school-row head" role="row">
                  <span role="columnheader">School</span>
                  <span role="columnheader" className="school-num">Students</span>
                  <span role="columnheader" className="school-num">Average</span>
                  <span role="columnheader" className="school-num">Past 50%</span>
                  <span role="columnheader">Average readiness</span>
                </div>
                {p.schools.map((s) => (
                  <div className="school-row" role="row" key={s.id}>
                    <span role="cell" className="school-name">{s.name}</span>
                    {s.stats.suppressed ? (
                      <span role="cell" className="school-hidden">
                        <i className="bi bi-shield-lock" aria-hidden="true" /> Fewer than{" "}
                        {s.stats.minGroupSize} students with a roadmap
                      </span>
                    ) : (
                      <>
                        <span role="cell" className="school-num" data-label="Students">
                          {s.stats.students}
                        </span>
                        <span role="cell" className="school-num" data-label="Average">
                          {s.stats.avgOverall}%
                        </span>
                        <span role="cell" className="school-num" data-label="Past 50%">
                          {s.stats.reached["50"]}%
                        </span>
                        <span
                          role="cell"
                          className="ps2-bar"
                          aria-label={`${s.name} average ${s.stats.avgOverall}%`}
                        >
                          <span style={{ width: `${s.stats.avgOverall}%` }} />
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="report-card" aria-labelledby="trends-title">
              <h2 id="trends-title" className="report-card-title">
                <i className="bi bi-signpost-split" aria-hidden="true" /> Roadmap milestones,
                all schools
              </h2>
              {p.trends ? <TrendsView trends={p.trends} /> : <Suppressed min={report!.minGroupSize} />}
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default AdminReportsPage;
