import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCareerProgress } from "../context/careerProgress";
import { CATEGORIES } from "../career/careerData";
import "./ProgressStrip.css";

// Slim career-readiness bar under the navbar. Click it to pull down the
// per-category breakdown and the next few milestones.
const ProgressStrip: React.FC = () => {
  const { progress, nextMilestones, toggleMilestone } = useCareerProgress();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ps-wrap" ref={ref}>
      <button
        type="button"
        className="ps-strip"
        aria-expanded={open}
        aria-controls="ps-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ps-label">
          <i className="bi bi-signpost-split" /> Career readiness
        </span>
        <span
          className="ps-bar"
          role="progressbar"
          aria-valuenow={progress.overall}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall career readiness"
        >
          <span className="ps-bar-fill" style={{ width: `${progress.overall}%` }} />
        </span>
        <span className="ps-pct">{progress.overall}%</span>
        <i className={`bi bi-chevron-down ps-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div id="ps-panel" className="ps-panel">
          <div className="ps-cols">
            <div>
              <h3 className="ps-heading">By category</h3>
              {CATEGORIES.map((c) => {
                const p = progress.byCategory[c.id];
                return (
                  <div key={c.id} className="ps-cat">
                    <span className="ps-cat-name">
                      <i className={`bi ${c.icon}`} /> {c.label}
                    </span>
                    <span className="ps-cat-bar">
                      <span style={{ width: `${p.pct}%` }} />
                    </span>
                    <span className="ps-cat-pct">
                      {p.done}/{p.total}
                    </span>
                  </div>
                );
              })}
            </div>

            <div>
              <h3 className="ps-heading">Up next</h3>
              {nextMilestones.length === 0 ? (
                <p className="ps-empty">Everything is done. 🎉</p>
              ) : (
                <ul className="ps-next">
                  {nextMilestones.map((ms) => (
                    <li key={ms.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleMilestone(ms.id)}
                        />
                        <span>{ms.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/roadmap" className="ps-link" onClick={() => setOpen(false)}>
                View full roadmap <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressStrip;
