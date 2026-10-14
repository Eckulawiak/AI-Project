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
            {/* Student pages: skill assessment and roadmap */}
            {userType === "Student" &&
              [
                { path: "/skill-assessment", label: "Skill Assessment" },
                { path: "/roadmap", label: "Roadmap" },
              ].map((link) => (
                <li className="nav-item" key={link.path}>
                  <button
                    className={`nav-btn ${location.pathname === link.path ? "nav-btn-active" : ""}`}
                    aria-current={location.pathname === link.path ? "page" : undefined}
                    onClick={() => {
                      navigate(link.path);
                      setMenuOpen(false);
                    }}
                  >
                    {link.label}
                  </button>
                </li>
              ))}

            {/* Student Navigation Toggle */}
            {userType === "Student" && (
              <li className="nav-item">
                <button
                  className="nav-btn"
                  onClick={() => handleToggleSubPage("/history")}
                >
                  {location.pathname === "/history" ? "Dashboard" : "History"}
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
