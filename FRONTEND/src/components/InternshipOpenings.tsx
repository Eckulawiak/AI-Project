import React, { useEffect, useState } from "react";
import { getInternships } from "../services/careerApi";
import type { InternshipListings } from "../career/careerData";

// Current internship openings for the student's career goal, shown on
// internship cards. Fetched once per page load and shared by every card.
let pending: Promise<InternshipListings> | null = null;
const load = () => {
  pending ??= getInternships().catch((e) => {
    pending = null; // let a later card retry
    throw e;
  });
  return pending;
};

const posted = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const InternshipOpenings: React.FC = () => {
  const [data, setData] = useState<InternshipListings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  return (
    <>
      <h3 className="rm-panel-sub">
        Current openings{data?.goal ? ` for ${data.goal}` : ""}
      </h3>
      {!data && <p className="rm-openings-note">Looking for openings…</p>}
      {data && !data.goal && (
        <p className="rm-openings-note">
          Add a career goal in the skill assessment to see openings here.
        </p>
      )}
      {data && data.goal && data.listings.length === 0 && (
        <p className="rm-openings-note">
          No openings found right now. Try the searches above, or check back later.
        </p>
      )}
      {data && data.listings.length > 0 && (
        <>
          <ul className="rm-openings">
            {data.listings.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.title} <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                </a>
                <span className="rm-openings-meta">
                  {[l.company, l.location, posted(l.postedAt), l.source]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="rm-openings-note">
            Listings come from {data.sources.join(", ")} and aren't reviewed by QU.
            Check each posting before you apply.
          </p>
        </>
      )}
    </>
  );
};

export default InternshipOpenings;
