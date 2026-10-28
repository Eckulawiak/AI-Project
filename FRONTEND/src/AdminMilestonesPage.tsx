// Admin "Milestones" page: add, edit and delete the milestones in each
// roadmap template. Students' roadmaps pick up changes the next time their
// roadmap is generated (retaking the assessment or Regenerate).
import React, { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import "./AdminDashboard.css";
import "./EditCourseMappingModal.css";
import "./AdminMilestonesPage.css";
import { CATEGORIES, CLASS_YEARS, type Category, type ClassYear } from "./career/careerData";
import {
  createTemplateMilestone,
  deleteTemplateMilestone,
  getRoadmapTemplates,
  getTemplateMilestones,
  updateTemplateMilestone,
  type Competency,
  type RoadmapTemplate,
  type TemplateMilestone,
  type TemplateMilestoneInput,
} from "./services/milestonesAdminApi";

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

const categoryLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
const yearLabel = (y: string) => CLASS_YEARS.find((x) => x.id === y)?.label ?? y;

const GOAL_LABELS: Record<string, string> = {
  ANY: "Any goal",
  INDUSTRY: "Industry",
  GRAD: "Grad school",
};

// "School of Communications · Any goal", "University default · Industry"
const templateScope = (t: RoadmapTemplate) =>
  `${t.major ?? t.school ?? "University default"} · ${GOAL_LABELS[t.goalType] ?? t.goalType}`;

type CategoryFilter = "ALL" | Category;
type YearFilter = "ALL" | ClassYear;

/* ------------------------------ Edit modal ------------------------------ */

type FormState = {
  category: Category;
  classYear: ClassYear;
  name: string;
  description: string;
  component: string;
  resources: string; // one per line
  position: string;
  competencyIds: number[];
  gapCompetencyId: string; // "" = always shown
};

const emptyForm = (): FormState => ({
  category: "CAREER_PREP",
  classYear: "FIRST",
  name: "",
  description: "",
  component: "",
  resources: "",
  position: "",
  competencyIds: [],
  gapCompetencyId: "",
});

const toForm = (m: TemplateMilestone): FormState => ({
  category: m.category,
  classYear: m.classYear,
  name: m.name,
  description: m.description ?? "",
  component: m.component ?? "",
  resources: m.resources.join("\n"),
  position: m.position == null ? "" : String(m.position),
  competencyIds: m.competencyIds,
  gapCompetencyId: m.gapCompetencyId == null ? "" : String(m.gapCompetencyId),
});

const toInput = (f: FormState): TemplateMilestoneInput => ({
  category: f.category,
  classYear: f.classYear,
  name: f.name.trim(),
  description: f.description.trim() || null,
  component: f.component.trim() || null,
  resources: f.resources
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean),
  position: f.position.trim() === "" ? null : Number(f.position),
  competencyIds: f.competencyIds,
  gapCompetencyId: f.gapCompetencyId === "" ? null : Number(f.gapCompetencyId),
});

const MilestoneModal: React.FC<{
  template: RoadmapTemplate;
  milestone: TemplateMilestone | null; // null = new
  competencies: Competency[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ template, milestone, competencies, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(() =>
    milestone ? toForm(milestone) : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleCompetency = (id: number) =>
    set(
      "competencyIds",
      form.competencyIds.includes(id)
        ? form.competencyIds.filter((x) => x !== id)
        : [...form.competencyIds, id],
    );

  const save = async () => {
    if (!form.name.trim()) {
      setError("Give the milestone a name.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const input = toInput(form);
      if (milestone) await updateTemplateMilestone(milestone.id, input);
      else await createTemplateMilestone(template.id, input);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(errorText(e, "Could not save the milestone"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-modal-backdrop" role="dialog" aria-modal="true">
      <div className="edit-modal ms-modal">
        <div className="edit-modal-header">
          <div>
            <h2>{milestone ? "Edit Milestone" : "Add Milestone"}</h2>
            <span className="edit-modal-subtitle">{template.name}</span>
          </div>
          <button className="edit-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="edit-modal-body">
          {error && <div className="edit-modal-error">{error}</div>}

          <div className="edit-modal-card">
            <div className="ms-form-row">
              <div>
                <label className="edit-modal-label" htmlFor="ms-year">
                  Class year
                </label>
                <select
                  id="ms-year"
                  className="edit-modal-input"
                  value={form.classYear}
                  onChange={(e) => set("classYear", e.target.value as ClassYear)}
                >
                  {CLASS_YEARS.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="edit-modal-label" htmlFor="ms-category">
                  Category
                </label>
                <select
                  id="ms-category"
                  className="edit-modal-input"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value as Category)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="edit-modal-label" htmlFor="ms-position">
                  Order
                </label>
                <input
                  id="ms-position"
                  className="edit-modal-input"
                  type="number"
                  min={0}
                  value={form.position}
                  onChange={(e) => set("position", e.target.value)}
                  placeholder="Last"
                />
              </div>
            </div>

            <label className="edit-modal-label" htmlFor="ms-name">
              Name students see
            </label>
            <input
              id="ms-name"
              className="edit-modal-input"
              maxLength={150}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Draft your first resume"
            />

            <label className="edit-modal-label" htmlFor="ms-description">
              Description
            </label>
            <textarea
              id="ms-description"
              className="edit-modal-textarea"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />

            <label className="edit-modal-label" htmlFor="ms-component">
              Area (framework component)
            </label>
            <input
              id="ms-component"
              className="edit-modal-input"
              maxLength={60}
              value={form.component}
              onChange={(e) => set("component", e.target.value)}
              placeholder="Resume"
            />
            <div className="edit-modal-help">
              A template can have one milestone per area in each year. Leave it empty if
              it doesn't belong to one.
            </div>

            <label className="edit-modal-label" htmlFor="ms-resources">
              Ways to do this (one per line)
            </label>
            <textarea
              id="ms-resources"
              className="edit-modal-textarea"
              value={form.resources}
              onChange={(e) => set("resources", e.target.value)}
              placeholder={"Career Labs\n1:1 career appointments"}
            />

            <label className="edit-modal-label" htmlFor="ms-gap">
              Who gets it
            </label>
            <select
              id="ms-gap"
              className="edit-modal-input"
              value={form.gapCompetencyId}
              onChange={(e) => set("gapCompetencyId", e.target.value)}
            >
              <option value="">Every student on this template</option>
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  Only students who rate {c.name} 1 or 2
                </option>
              ))}
            </select>
          </div>

          <div className="edit-modal-column">
            <h3>Competencies</h3>
            <div className="edit-modal-list">
              {competencies.map((c) => (
                <label key={c.id} className="edit-modal-item">
                  <input
                    type="checkbox"
                    checked={form.competencyIds.includes(c.id)}
                    onChange={() => toggleCompetency(c.id)}
                  />{" "}
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="edit-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* --------------------------------- Page --------------------------------- */

const AdminMilestonesPage: React.FC = () => {
  const [templates, setTemplates] = useState<RoadmapTemplate[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<YearFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");

  const [rows, setRows] = useState<TemplateMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // undefined = closed, null = adding, a milestone = editing
  const [editing, setEditing] = useState<TemplateMilestone | null | undefined>(undefined);

  useEffect(() => {
    getRoadmapTemplates()
      .then((data) => {
        setTemplates(data.templates);
        setCompetencies(data.competencies);
        if (data.templates[0]) setTemplateId(String(data.templates[0].id));
      })
      .catch((e: unknown) => setError(errorText(e, "Failed to load templates")));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getTemplateMilestones(Number(templateId));
        if (cancelled) return;
        setRows(data);
        // keep the count in the template picker current after adds/deletes
        setTemplates((ts) =>
          ts.map((t) =>
            String(t.id) === templateId ? { ...t, milestoneCount: data.length } : t,
          ),
        );
      } catch (e: unknown) {
        if (!cancelled) setError(errorText(e, "Failed to load milestones"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, refreshKey]);

  const template = templates.find((t) => String(t.id) === templateId) ?? null;
  const competencyName = useMemo(
    () => new Map(competencies.map((c) => [c.id, c.name])),
    [competencies],
  );

  const filteredRows = rows.filter(
    (r) =>
      (yearFilter === "ALL" || r.classYear === yearFilter) &&
      (categoryFilter === "ALL" || r.category === categoryFilter),
  );

  const handleDelete = async (m: TemplateMilestone) => {
    if (
      !window.confirm(
        `Delete "${m.name}"? Students who already have it keep their copy; new roadmaps won't include it.`,
      )
    )
      return;
    try {
      await deleteTemplateMilestone(m.id);
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      setError(errorText(e, "Could not delete the milestone"));
    }
  };

  return (
    <div className="admin-dashboard">
      <Navbar />

      <div className="admin-content">
        <section className="admin-header">
          <h1 className="admin-title">Roadmap Milestones</h1>
          <p className="admin-subtitle">
            Add, edit and remove the milestones each roadmap template gives students.
          </p>
        </section>

        <section className="admin-filter-bar">
          <div className="filter-left">
            <span className="filter-icon" aria-hidden="true">
              <i className="bi bi-funnel"></i>
            </span>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="template-select">
                Template:
              </label>
              <select
                id="template-select"
                className="filter-select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {templateScope(t)} ({t.milestoneCount})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="year-select">
                Year:
              </label>
              <select
                id="year-select"
                className="filter-select ms-filter-short"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value as YearFilter)}
              >
                <option value="ALL">All</option>
                {CLASS_YEARS.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-inline">
              <label className="filter-label" htmlFor="category-select">
                Category:
              </label>
              <select
                id="category-select"
                className="filter-select ms-filter-short"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              >
                <option value="ALL">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="ms-add-button"
            onClick={() => setEditing(null)}
            disabled={!template}
          >
            <i className="bi bi-plus-lg"></i> Add Milestone
          </button>
        </section>

        {loading && (
          <section className="admin-table-card">
            <div className="muted" style={{ padding: 16 }}>
              Loading milestones…
            </div>
          </section>
        )}

        {error && (
          <section className="admin-table-card">
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>Something went wrong.</div>
              <div className="muted">{error}</div>
            </div>
          </section>
        )}

        {!loading && !error && template && (
          <section className="admin-table-card">
            <div className="admin-table ms-table">
              <div className="admin-table-row admin-table-header">
                <div className="admin-cell">Year</div>
                <div className="admin-cell">Milestone</div>
                <div className="admin-cell">Category</div>
                <div className="admin-cell">Ways to do this</div>
                <div className="admin-cell">Competencies</div>
              </div>

              {filteredRows.map((row) => (
                <div className="admin-table-row" key={row.id}>
                  <div className="admin-cell ms-cell-year">
                    {yearLabel(row.classYear)}
                  </div>
                  <div className="admin-cell admin-cell-course ms-cell-name">
                    <div className="course-code">{row.name}</div>
                    {row.component && <div className="course-name">{row.component}</div>}
                    {row.description && (
                      <div className="ms-description">{row.description}</div>
                    )}
                    {row.gapCompetencyId != null && (
                      <span className="ms-tag">
                        Only if {competencyName.get(row.gapCompetencyId) ?? "a competency"} is
                        rated 1–2
                      </span>
                    )}
                  </div>
                  <div className="admin-cell ms-cell-category">
                    {categoryLabel(row.category)}
                  </div>
                  <div className="admin-cell ms-cell-resources">
                    {row.resources.length > 0 ? (
                      <ul>
                        {row.resources.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">None listed</span>
                    )}
                  </div>
                  <div className="admin-cell ms-cell-competencies">
                    <div className="competency-content">
                      {row.competencyIds.length > 0 ? (
                        <ul>
                          {row.competencyIds.map((id) => (
                            <li key={id}>{competencyName.get(id) ?? id}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">None</span>
                      )}
                      <div className="ms-actions">
                        <button
                          type="button"
                          className="edit-icon-button"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => setEditing(row)}
                        >
                          <i className="bi bi-pencil-square"></i>
                        </button>
                        <button
                          type="button"
                          className="edit-icon-button ms-delete"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => handleDelete(row)}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filteredRows.length === 0 && (
                <div className="admin-table-row admin-empty-row">
                  <div className="admin-cell" style={{ gridColumn: "1 / 6" }}>
                    <span className="muted">No milestones match the selected filters.</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {editing !== undefined && template && (
        <MilestoneModal
          template={template}
          milestone={editing}
          competencies={competencies}
          onClose={() => setEditing(undefined)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <Footer />
    </div>
  );
};

export default AdminMilestonesPage;
