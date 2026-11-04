import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateAccountModal from "./CreateAccountModal";
import LoginModal from "./LoginModal";
import { loadSession } from "./Session";
import "./LandingPage.css";
import nameLogo from "./assets/name_logo.png";
import ForgotPasswordModal from "./ForgotPasswordModal";

function getDestination(userType: string): string {
  if (userType === "Student") return "/studentdashboard";
  if (userType === "Administrator") return "/adminDashboard";
  return "/facultyAdmin";
}

const App: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();

  const handleLoginClick = () => {
    // If a valid session token already exists, skip the modal and
    // navigate directly to the appropriate dashboard
    const session = loadSession();
    if (session?.token) {
      navigate(getDestination(session.userType), { replace: true });
      return;
    }
    setShowLoginModal(true);
  };

  return (
    <div className="landing-page bg-light min-vh-100 d-flex flex-column">
      <header className="hero-section d-flex align-items-center justify-content-center">
        <img
          src={nameLogo}
          alt="Quinnipiac Bobcats logo"
          className="hero-logo img-fluid"
        />
      </header>

      <main className="flex-grow-1">
        <section className="container-fluid py-5 main-section-center">
          <div className="content-wrapper text-center">
            <h1 className="display-4 fw-bold mb-3 text-color-primary">
              Welcome to Quinnipiac Career Services
            </h1>

            <h2 className="h4 fw-semibold mb-2 text-color-primary">
              Explore Careers, Build Your Skills, and Plan Your Next Steps
            </h2>

            <div className="cta-buttons">
              <button
                type="button"
                className="buttons me-3 px-4 py-2"
                onClick={handleLoginClick}
              >
                Log In
              </button>

              <button
                type="button"
                className="buttons px-4 py-2"
                onClick={() => setShowCreateModal(true)}
              >
                Create Account
              </button>
            </div>
          </div>
        </section>
      </main>

      <LoginModal
        showModal={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <CreateAccountModal
        showModal={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <ForgotPasswordModal
        showModal={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
};

export default App;
