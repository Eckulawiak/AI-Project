// Shared pieces for the faculty Student Progress and admin Reports pages.
import React from "react";
import { CATEGORIES, CLASS_YEARS } from "../career/careerData";
import type { GroupStats, Trends } from "../services/reportsApi";
import "./ProgressStats.css";

const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
const yearLabel = (y: string | null) => CLASS_YEARS.find((c) => c.id === y)?.label ?? "";
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const Bar: React.FC<{ label: string; pct: number; icon?: string }> = ({ label, pct, icon }) => (
  <div className="ps2-bar-row">
    <span className="ps2-bar-label">
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />} {label}
    </span>
    <span
      className="ps2-bar"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
    <span className="ps2-bar-value">{fmt(pct)}</span>
  </div>
);

export const Suppressed: React.FC<{ min: number }> = ({ min }) => (
  <p className="ps2-suppressed">
    <i className="bi bi-shield-lock" aria-hidden="true" /> Fewer than {min} students
    have a roadmap here yet, so results are hidden to protect their privacy.
  </p>
);

// Headline numbers, category breakdown and roadmap-year breakdown for a group.
export const GroupStatsView: React.FC<{ stats: GroupStats; compact?: boolean }> = ({
  stats,
  compact,
}) => {
  if (stats.suppressed) return <Suppressed min={stats.minGroupSize} />;

  return (
    <div className={`ps2-stats ${compact ? "compact" : ""}`}>
      <div className="ps2-kpis">
        <div className="ps2-kpi">
          <span className="ps2-kpi-value">{fmt(stats.avgOverall)}</span>
          <span className="ps2-kpi-label">average readiness</span>
        </div>
        <div className="ps2-kpi">
          <span className="ps2-kpi-value">{fmt(stats.medianOverall)}</span>
          <span className="ps2-kpi-label">median</span>
        </div>
        <div className="ps2-kpi">
          <span className="ps2-kpi-value">{stats.students}</span>
          <span className="ps2-kpi-label">{compact ? "students" : "students with a roadmap"}</span>
        </div>
      </div>

      <div className="ps2-reached" aria-label="Share of students past each milestone">
        {(["25", "50", "75"] as const).map((t) => (
          <span key={t} className="ps2-chip">
            <strong>{fmt(stats.reached[t])}</strong> past {t}%
          </span>
        ))}
      </div>

      <div className="ps2-columns">
        <div>
          <h4 className="ps2-sub">By category</h4>
          {CATEGORIES.map((c) => (
            <Bar key={c.id} label={c.label} icon={c.icon} pct={stats.byCategory[c.id] ?? 0} />
          ))}
        </div>
        {!compact && stats.byClassYear.length > 0 && (
          <div>
            <h4 className="ps2-sub">Milestones done, by roadmap year</h4>
            {stats.byClassYear.map((y) => (
              <Bar key={y.classYear} label={yearLabel(y.classYear)} pct={y.pct} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Most and least completed shared milestones (REQ-ROAD-8).
export const TrendsView: React.FC<{ trends: Trends }> = ({ trends }) => {
  const list = (items: Trends["mostCompleted"], tone: "good" | "gap") => (
    <ol className={`ps2-trend-list ${tone}`}>
      {items.map((m) => (
        <li key={`${m.category}:${m.name}`}>
          <span className="ps2-trend-name">{m.name}</span>
          <span className="ps2-trend-meta">
            {categoryLabel(m.category)}
            {m.classYear ? ` · ${yearLabel(m.classYear)}` : ""}
          </span>
          <span className="ps2-trend-pct">{fmt(m.completedPct)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="ps2-trends">
      <div>
        <h4 className="ps2-sub">
          <i className="bi bi-check2-circle" aria-hidden="true" /> Most completed
        </h4>
        {list(trends.mostCompleted, "good")}
      </div>
      <div>
        <h4 className="ps2-sub">
          <i className="bi bi-hourglass-split" aria-hidden="true" /> Least completed
        </h4>
        {list(trends.leastCompleted, "gap")}
      </div>
    </div>
  );
};
