import React, { useEffect, useMemo, useRef } from "react";
import type { CelebrationEvent } from "../context/careerProgress";
import "./Celebration.css";

const COLORS = ["#ffb718", "#131d43", "#2f9e6e", "#e4572e", "#4c7bd9"];

// A dismissible, non-blocking celebration (REQ-PROG-3 to 5). The confetti
// ignores clicks, and the card closes on its own after a few seconds.
const Celebration: React.FC<{ event: CelebrationEvent; onDismiss: () => void }> = ({
  event,
  onDismiss,
}) => {
  const big = event.kind === "threshold";

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), big ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [event.key, big]);

  const pieces = useMemo(
    () =>
      Array.from({ length: big ? 70 : 24 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * (big ? 0.8 : 0.3),
        duration: 1.6 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
      })),
    // new confetti for each event
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event.key],
  );

  return (
    <>
      <div className="confetti-layer" aria-hidden="true" key={event.key}>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div
        className={`celebration-card ${big ? "celebration-big" : ""}`}
        role="status"
        aria-live="polite"
      >
        <i className={`bi ${big ? "bi-trophy-fill" : "bi-check-circle-fill"} celebration-icon`} />
        <div className="celebration-text">
          <strong>{event.title}</strong>
          <span>{event.message}</span>
        </div>
        <button
          type="button"
          className="celebration-close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>
    </>
  );
};

export default Celebration;
