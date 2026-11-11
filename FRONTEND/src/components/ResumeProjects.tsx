// Saved projects on the Student Dashboard (REQ-RES-1). Students add a
// project once, then click it to include it when generating.
import React, { useEffect, useState } from "react";
import {
  PROJECT_LIMITS,
  createProject,
  deleteProject,
  getProjects,
  updateProject,
  type StudentProject,
} from "../services/projectsApi";
import "./ResumeInputs.css";

interface Props {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onAdded: (id: number) => void;
  onDeleted: (id: number) => void;
}

type Draft = { title: string; description: string; skills: string };
const EMPTY: Draft = { title: "", description: "", skills: "" };

// Comma-separated skills, without blanks or case-insensitive repeats.
const splitSkills = (text: string) => {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const ResumeProjects: React.FC<Props> = ({ selectedIds, onToggle, onAdded, onDeleted }) => {
  const [projects, setProjects] = useState<StudentProject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null: form closed; "new": adding; a number: editing that project
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProjects()
      .then((rows) => setProjects(Array.isArray(rows) ? rows : []))
      .catch((e: Error) => {
        setProjects([]);
        setLoadError(e.message || "Couldn't load your projects.");
      });
  }, []);

  const openForm = (project?: StudentProject) => {
    setEditing(project ? project.id : "new");
    setDraft(
      project
        ? {
            title: project.title,
            description: project.description ?? "",
            skills: project.skills.join(", "),
          }
        : EMPTY,
    );
    setFormError(null);
  };

  const closeForm = () => {
    setEditing(null);
    setDraft(EMPTY);
    setFormError(null);
  };

  const skillList = splitSkills(draft.skills);
  const draftError = !draft.title.trim()
    ? "Give your project a title."
    : skillList.length > PROJECT_LIMITS.maxSkills
      ? `List up to ${PROJECT_LIMITS.maxSkills} skills.`
      : skillList.some((s) => s.length > PROJECT_LIMITS.skill)
        ? `Keep each skill under ${PROJECT_LIMITS.skill} characters.`
        : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftError) return setFormError(draftError);
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      skills: skillList,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing === "new") {
        const created = await createProject(body);
        setProjects((prev) => [...(prev ?? []), created]);
        onAdded(created.id);
      } else if (editing != null) {
        const updated = await updateProject(editing, body);
        setProjects((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)));
      }
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save your project.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (project: StudentProject) => {
    if (!window.confirm(`Delete "${project.title}"? This can't be undone.`)) return;
    try {
      await deleteProject(project.id);
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== project.id));
      onDeleted(project.id);
      if (editing === project.id) closeForm();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't delete your project.");
    }
  };

  return (
    <div className="card-row">
      <span className="field-label">Your Projects:</span>
      <p className="ri-hint">
        Class, club, personal or work projects. Click a project to include it.
      </p>

      {projects === null ? (
        <p className="ri-hint">Loading your projects...</p>
      ) : (
        <div className="class-grid">
          {projects.map((p) => {
            const selected = selectedIds.has(p.id);
            return (
              <div
                key={p.id}
                className={`class-option-box ri-project${selected ? " selected" : ""}`}
              >
                <button
                  type="button"
                  className="ri-project-toggle"
                  aria-pressed={selected}
                  onClick={() => onToggle(p.id)}
                >
                  <span className="class-option-code ri-project-title">{p.title}</span>
                  {p.skills.length > 0 && (
                    <span className="class-option-name">{p.skills.join(" · ")}</span>
                  )}
                </button>
                <span className="ri-project-actions">
                  <button
                    type="button"
                    className="ri-icon-btn"
                    aria-label={`Edit ${p.title}`}
                    onClick={() => openForm(p)}
                  >
                    <i className="bi bi-pencil" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ri-icon-btn"
                    aria-label={`Delete ${p.title}`}
                    onClick={() => remove(p)}
                  >
                    <i className="bi bi-trash" aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}

          {editing === null && (
            <button type="button" className="ri-add-box" onClick={() => openForm()}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> Add a project
            </button>
          )}
        </div>
      )}

      {loadError && <p className="ri-error">{loadError}</p>}

      {editing !== null && (
        <form className="ri-form" onSubmit={save} noValidate>
          <h3 className="ri-form-title">{editing === "new" ? "Add a project" : "Edit project"}</h3>

          <label className="ri-label" htmlFor="project-title">
            Title
          </label>
          <input
            id="project-title"
            className="ri-input"
            value={draft.title}
            maxLength={PROJECT_LIMITS.title}
            placeholder="e.g. Campus dining menu app"
            autoFocus
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          <label className="ri-label" htmlFor="project-description">
            What did you do? <span className="ri-optional">(optional)</span>
          </label>
          <textarea
            id="project-description"
            className="ri-input ri-textarea"
            value={draft.description}
            maxLength={PROJECT_LIMITS.description}
            rows={3}
            placeholder="A sentence or two about what you built, your role and the result."
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <span className="ri-count">
            {draft.description.length}/{PROJECT_LIMITS.description}
          </span>

          <label className="ri-label" htmlFor="project-skills">
            Tools and skills used <span className="ri-optional">(comma separated)</span>
          </label>
          <input
            id="project-skills"
            className="ri-input"
            value={draft.skills}
            placeholder="e.g. React, Supabase, Teamwork"
            onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
          />

          {formError && <p className="ri-error">{formError}</p>}

          <div className="ri-form-actions">
            <button type="button" className="btn-export" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-generate ri-save" disabled={saving}>
              {saving ? "Saving..." : editing === "new" ? "Add project" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ResumeProjects;
