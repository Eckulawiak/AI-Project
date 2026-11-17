import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Footer from "./footer";
import "./HistoryPage.css";
import { loadSession } from "./Session";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// The History API needs the student's login token.
const authHeaders = (): Record<string, string> => {
  const token = loadSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type HistoryItem = {
  id: number;
  Date: string;
  CourseName: string;
  CourseCode: string;
  TalkingPoint: string;
};

type HistoryGroup = {
  dateKey: string;
  displayDate: string;
  items: HistoryItem[];
};

const HistoryPage: React.FC = () => {
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingDateKey, setDeletingDateKey] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const getLoggedInStudentId = (): number => {
    const session = loadSession();

    if (!session) {
      throw new Error("No active session found.");
    }

    if (session.userType !== "Student") {
      throw new Error("Only students can view history.");
    }

    const tokenParts = session.token.split(".");
    if (tokenParts.length < 2) {
      throw new Error("Invalid session token.");
    }

    const payload = JSON.parse(atob(tokenParts[1]));
    const studentId = Number(payload.userId);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new Error("Invalid student id in session token.");
    }

    return studentId;
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const studentId = getLoggedInStudentId();

        const response = await fetch(
          `${API_BASE_URL}/api/history/student/${studentId}`,
          { headers: authHeaders() },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          throw new Error(err?.error || "Failed to load history.");
        }

        const data: HistoryItem[] = await response.json();

        const groupedMap = new Map<string, HistoryItem[]>();

        data.forEach((item) => {
          const dateObj = new Date(item.Date);
          const dateKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}-${dateObj.getHours()}-${dateObj.getMinutes()}`;

          if (!groupedMap.has(dateKey)) {
            groupedMap.set(dateKey, []);
          }

          groupedMap.get(dateKey)!.push(item);
        });

        const groupedHistory: HistoryGroup[] = Array.from(groupedMap.entries())
          .map(([dateKey, items]) => ({
            dateKey,
            displayDate: new Date(items[0].Date).toLocaleString(),
            items,
          }))
          .sort(
            (a, b) =>
              new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime(),
          );

        setHistory(groupedHistory);
      } catch (error: any) {
        console.error("History load error:", error);
        setErrorMsg(error.message || "Failed to load history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const toggleDate = (dateKey: string) => {
    setExpandedDate((prev) => (prev === dateKey ? null : dateKey));
  };

  const handleDeleteDateGroup = async (
    dateKey: string,
    items: HistoryItem[],
  ) => {
    const confirmed = window.confirm(
      "Delete all saved talking points for this date and time?",
    );

    if (!confirmed) return;

    try {
      setDeletingDateKey(dateKey);
      setErrorMsg(null);

      const studentId = getLoggedInStudentId();

      for (const item of items) {
        const response = await fetch(
          `${API_BASE_URL}/api/history/student/${studentId}/entry/${item.id}`,
          {
            method: "DELETE",
            headers: authHeaders(),
          },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          throw new Error(err?.error || "Failed to delete history entry.");
        }
      }

      setHistory((prev) => prev.filter((group) => group.dateKey !== dateKey));

      if (expandedDate === dateKey) {
        setExpandedDate(null);
      }
    } catch (error: any) {
      console.error("Delete history group error:", error);
      setErrorMsg(error.message || "Failed to delete history group.");
    } finally {
      setDeletingDateKey(null);
    }
  };

  const handleClearAllHistory = async () => {
    const confirmed = window.confirm("Delete all saved history entries?");

    if (!confirmed) return;

    try {
      setIsClearingAll(true);
      setErrorMsg(null);

      const studentId = getLoggedInStudentId();

      const response = await fetch(
        `${API_BASE_URL}/api/history/student/${studentId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Failed to clear history.");
      }

      setHistory([]);
      setExpandedDate(null);
    } catch (error: any) {
      console.error("Clear all history error:", error);
      setErrorMsg(error.message || "Failed to clear history.");
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="dashboard-page">
      <Navbar />

      <main className="dashboard-main">
        <section className="dashboard-title-block">
          <h1 className="dashboard-title">History</h1>
          <p className="dashboard-subtitle">
            View your saved talking points by date.
          </p>
        </section>

        <section className="card-section">
          <div className="card-surface history-card">
            <div className="history-title-row">
              <h2 className="card-title">Saved History</h2>

              <button
                type="button"
                className="history-clear-button"
                onClick={handleClearAllHistory}
                disabled={isClearingAll || history.length === 0}
              >
                {isClearingAll ? "Clearing..." : "Clear History"}
              </button>
            </div>

            {loading ? (
              <p className="placeholder-text">Loading history...</p>
            ) : errorMsg ? (
              <p className="error-text">{errorMsg}</p>
            ) : history.length === 0 ? (
              <p className="placeholder-text">
                No saved talking points found yet.
              </p>
            ) : (
              <div className="history-list">
                {history.map((group) => {
                  const isOpen = expandedDate === group.dateKey;

                  return (
                    <div key={group.dateKey} className="history-group">
                      <div className="history-date-row">
                        <button
                          type="button"
                          className="history-date-button"
                          onClick={() => toggleDate(group.dateKey)}
                        >
                          <span>{group.displayDate}</span>
                          <span
                            className={`history-arrow ${isOpen ? "open" : ""}`}
                          >
                            ▼
                          </span>
                        </button>

                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() =>
                            handleDeleteDateGroup(group.dateKey, group.items)
                          }
                          disabled={deletingDateKey === group.dateKey}
                          title="Delete"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>

                      {isOpen && (
                        <div className="history-dropdown-content">
                          {Object.entries(
                            group.items.reduce<Record<string, HistoryItem[]>>(
                              (acc, item) => {
                                const key = `${item.CourseName} (${item.CourseCode})`;

                                if (!acc[key]) acc[key] = [];
                                acc[key].push(item);

                                return acc;
                              },
                              {},
                            ),
                          ).map(([courseLabel, items]) => (
                            <div
                              key={courseLabel}
                              className="history-entry-card"
                            >
                              <h3 className="history-course-header">
                                {courseLabel}:
                              </h3>

                              <ul className="history-talking-points">
                                {items.map((item) => (
                                  <li key={item.id}>{item.TalkingPoint}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HistoryPage;
