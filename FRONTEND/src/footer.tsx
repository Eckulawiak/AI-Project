import React from "react";
import "./footer.css";
import crest from "./assets/crest_logo.png";

const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="footer-left">
        <img
          src={crest}
          alt="Quinnipiac University logo"
          className="footer-logo"
        />
        <span>Quinnipiac Career Services</span>
      </div>

      <button type="button" className="footer-link">
        Learn More
      </button>
    </footer>
  );
};

export default Footer;
