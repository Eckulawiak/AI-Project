import React from "react";

// Credit required by the CareerOneStop Web Services license: every page
// that shows CareerOneStop data must acknowledge both the U.S. Department
// of Labor, Employment and Training Administration (DOLETA) and the
// Minnesota Department of Employment and Economic Development (DEED).
const CareerOneStopAttribution: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className={`rm-onet-credit ${compact ? "compact" : ""}`}>
    <p>
      Certification information from{" "}
      <a href="https://www.careeronestop.org/" target="_blank" rel="noopener noreferrer">
        CareerOneStop
      </a>
      , sponsored by the U.S. Department of Labor, Employment and Training
      Administration (DOLETA), and the Minnesota Department of Employment and
      Economic Development (DEED).
    </p>
  </div>
);

export default CareerOneStopAttribution;
