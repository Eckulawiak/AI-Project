// Career goals for resume generation (REQ-RES-1). Starts with the goal on
// the student's profile; extra goals here are only used for generating.
import React from "react";
import { GOAL_LIMITS } from "../services/projectsApi";
import "./ResumeInputs.css";

interface Props {
  goals: string[];
  onChange: (goals: string[]) => void;
}

const CareerGoalsInput: React.FC<Props> = ({ goals, onChange }) => {
  const set = (i: number, value: string) => onChange(goals.map((g, j) => (j === i ? value : g)));

  return (
    <div className="card-row">
      <span className="field-label">Career Goal:</span>
      <p className="ri-hint">
        The AI words your bullet points toward this. It's filled in from your profile; you can
        change it or add another.
      </p>

      {goals.map((goal, i) => (
        <div className="ri-goal-row" key={i}>
          <input
            className="ri-input"
            aria-label={`Career goal ${i + 1}`}
            value={goal}
            maxLength={GOAL_LIMITS.goal}
            placeholder={i === 0 ? "e.g. Software Engineer" : "Another goal"}
            onChange={(e) => set(i, e.target.value)}
          />
          {goals.length > 1 && (
            <button
              type="button"
              className="ri-icon-btn"
              aria-label={`Remove career goal ${i + 1}`}
              onClick={() => onChange(goals.filter((_, j) => j !== i))}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}

      {goals.length < GOAL_LIMITS.maxGoals && (
        <button type="button" className="ri-link-btn" onClick={() => onChange([...goals, ""])}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Add another goal
        </button>
      )}
    </div>
  );
};

export default CareerGoalsInput;
