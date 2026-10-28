import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Navbar.css";
import quLogo from "./assets/Qyellow_logo.png";
import EditAccountModal from "./EditAccountModal";
import { loadSession, clearSession } from "./Session";
import ProgressStrip from "./components/ProgressStrip";

// Pages that show the pull-down career progress strip under the navbar.
// The roadmap has its own progress bar, and the assessment shouldn't be cluttered.
const STRIP_PATHS = ["/studentdashboard", "/history"];

const STUDENT_LINKS = [
  { path: "/skill-assessment", label: "Skill Assessment" },
  { path: "/roadmap", label: "Roadmap" },
  { path: "/history", label: "History" },
];

const Navbar: React.FC = () => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation(); // Hook to get the current URL path

  useEffect(() => {
    const session = loadSession();
    setUserType(session?.userType ?? null);
  }, []);

  const handleProfileClick = () => {
    if (userType) {
      setShowEditModal(true);
      setMenuOpen(false);
    } else {
      console.warn("No session found; cannot open EditAccountModal.");
    }
  };

  // Dynamic Navigation Handler
  const handleToggleSubPage = (targetPath: string) => {
    if (location.pathname === targetPath) {
      // If we are already on the sub-page, route back to the correct dashboard
      if (userType === "Student") {
        navigate("/studentdashboard");
      } else if (userType === "Administrator" || userType === "Admin") {
        navigate("/adminDashboard");
      } else if (userType === "Faculty/Administrator") {
        navigate("/facultyAdmin");
      } else {
        navigate("/"); // Fallback
      }
    } else {
      // Otherwise, go to the sub-page
      navigate(targetPath);
    }
    setMenuOpen(false);
  };

  const handleSignOut = async () => {
    await clearSession();
    setUserType(null);
    setMenuOpen(false);
    navigate("/");
  };

  return (
    <>
      <nav className="app-navbar navbar navbar-expand-lg px-4">
        <a className="navbar-brand d-flex align-items-center">
          <img
            src={quLogo}
            alt="Quinnipiac University logo"
            className="navbar-logo"
          />
        </a>

        <button
          className="navbar-toggler custom-toggle"
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-controls="navbarContent"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div
          className={`navbar-collapse ${menuOpen ? "show" : ""}`}
          id="navbarContent"
        >
          <ul className="navbar-nav ms-auto mb-2 mb-lg-0">
            {/* Student pages. Like History, each link turns into "Dashboard"
                while you're on that page, so you can always get back. */}
            {userType === "Student" &&
              STUDENT_LINKS.map((link) => (
                <li className="nav-item" key={link.path}>
                  <button
                    className="nav-btn"
                    onClick={() => handleToggleSubPage(link.path)}
                  >
                    {location.pathname === link.path ? "Dashboard" : link.label}
                  </button>
                </li>
              ))}

            {/* Faculty: de-identified student progress (REQ-PROG-7, REQ-ROAD-8) */}
            {userType === "Faculty/Administrator" && (
              <li className="nav-item">
                <button
                  className="nav-btn"
                  onClick={() => handleToggleSubPage("/faculty-progress")}
                >
                  {location.pathname === "/faculty-progress"
                    ? "Dashboard"
                    : "Student Progress"}
                </button>
              </li>
            )}

            {/* Admin: roadmap template milestones (add, edit, delete) */}
            {(userType === "Administrator" || userType === "Admin") && (
              <li className="nav-item">
                <button
                  className="nav-btn"
                  onClick={() => handleToggleSubPage("/admin-milestones")}
                >
                  {location.pathname === "/admin-milestones"
                    ? "Dashboard"
                    : "Milestones"}
                </button>
              </li>
            )}

            {/* Admin: usage and progress reports (REQ-PROG-8) */}
            {(userType === "Administrator" || userType === "Admin") && (
              <li className="nav-item">
                <button
                  className="nav-btn"
                  onClick={() => handleToggleSubPage("/admin-reports")}
                >
                  {location.pathname === "/admin-reports" ? "Dashboard" : "Reports"}
                </button>
              </li>
            )}

            {/* Admin Navigation Toggle (checking both Admin and Administrator for DB safety) */}
            {(userType === "Administrator" || userType === "Admin") && (
              <li className="nav-item">
                <button
                  className="nav-btn"
                  onClick={() => handleToggleSubPage("/audit-logs")}
                >
                  {location.pathname === "/audit-logs"
                    ? "Dashboard"
                    : "Audit Logs"}
                </button>
              </li>
            )}

            <li className="nav-item">
              <button className="nav-btn" onClick={handleProfileClick}>
                Profile
              </button>
            </li>

            <li className="nav-item">
              <button className="nav-btn" onClick={handleSignOut}>
                Log Out
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {userType === "Student" && STRIP_PATHS.includes(location.pathname) && (
        <ProgressStrip />
      )}

      {showEditModal && userType && (
        <EditAccountModal
          showModal={showEditModal}
          onClose={() => setShowEditModal(false)}
          userType={userType as "Student" | "Faculty/Administrator"}
        />
      )}
    </>
  );
};

export default Navbar;
