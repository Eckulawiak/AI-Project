import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import "./App.css";
import App from "./App.tsx";
import StudentDashboard from "./studentDashboard.tsx";
import FacultyDashboard from "./facultyDashboard.tsx";
import AdminDashboard from "./AdminDashboard.tsx";
import UnmappedCourses from "./UnmappedCourses.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import HistoryPage from "./HistoryPage";
import AuditLogsPage from "./AuditLogsPage";
import FacultyProgressPage from "./FacultyProgressPage";
import AdminReportsPage from "./AdminReportsPage";
import SkillAssessmentPage from "./SkillAssessmentPage";
import RoadmapPage from "./RoadmapPage";
import SkillReviewsPage from "./SkillReviewsPage";
import FacultyReviewsPage from "./FacultyReviewsPage";
import { CareerProgressProvider } from "./context/CareerProgressContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <CareerProgressProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<App />} />

        {/* Students only */}
        <Route
          path="/studentdashboard"
          element={
            <ProtectedRoute allowedTypes={["Student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute allowedTypes={["Student"]}>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/skill-assessment"
          element={
            <ProtectedRoute allowedTypes={["Student"]}>
              <SkillAssessmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roadmap"
          element={
            <ProtectedRoute allowedTypes={["Student"]}>
              <RoadmapPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/skill-reviews"
          element={
            <ProtectedRoute allowedTypes={["Student"]}>
              <SkillReviewsPage />
            </ProtectedRoute>
          }
        />

        {/* Faculty only */}
        <Route
          path="/facultyAdmin"
          element={
            <ProtectedRoute allowedTypes={["Faculty/Administrator"]}>
              <FacultyDashboard />
            </ProtectedRoute>
          }
        />

        {/* Admins only */}
        <Route
          path="/adminDashboard"
          element={
            <ProtectedRoute allowedTypes={["Administrator"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Admins only */}
        <Route
          path="/unmapped"
          element={
            <ProtectedRoute allowedTypes={["Administrator"]}>
              <UnmappedCourses />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty-progress"
          element={
            <ProtectedRoute allowedTypes={["Faculty/Administrator", "Administrator"]}>
              <FacultyProgressPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/faculty-reviews"
          element={
            <ProtectedRoute allowedTypes={["Faculty/Administrator", "Administrator"]}>
              <FacultyReviewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-reports"
          element={
            <ProtectedRoute allowedTypes={["Administrator"]}>
              <AdminReportsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/audit-logs" element={<AuditLogsPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </CareerProgressProvider>
    </BrowserRouter>
  </StrictMode>,
);
