import React from "react";

// Credit required by the O*NET Web Services license
// (https://services.onetcenter.org/help/license_data): the "in it" logo
// linking to O*NET Web Services, the attribution statement and the
// trademark line, shown near the information it covers.
const OnetAttribution: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className={`rm-onet-credit ${compact ? "compact" : ""}`}>
    <a
      href="https://services.onetcenter.org/"
      target="_blank"
      rel="noopener noreferrer"
      title="This application incorporates information from O*NET Web Services. Click to learn more."
    >
      <img
        src="https://services.onetcenter.org/shared/image/logos/onet-in-it.svg"
        alt="O*NET in-it"
        width={compact ? 90 : 120}
      />
    </a>
    <p>
      This application incorporates information from{" "}
      <a href="https://services.onetcenter.org/" target="_blank" rel="noopener noreferrer">
        O*NET Web Services
      </a>{" "}
      by the U.S. Department of Labor, Employment and Training Administration
      (USDOL/ETA). O*NET&reg; is a trademark of USDOL/ETA.
    </p>
  </div>
);

export default OnetAttribution;
