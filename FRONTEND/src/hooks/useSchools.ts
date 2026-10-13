import { useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";

export interface MajorOption {
  id: number;
  name: string;
}

export interface SchoolOption {
  id: number;
  name: string;
  majors: MajorOption[];
}

// Schools with their majors nested, loaded once from GET /courses/schools.
export function useSchools() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    apiClient<SchoolOption[]>("/courses/schools")
      .then((data) => {
        if (!cancelled) setSchools(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Failed to load schools:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  return schools;
}
