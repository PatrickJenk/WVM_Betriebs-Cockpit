const path = require("node:path");
process.env.NODE_ENV = "production";
process.env.COCKPIT_DATA_DIR ||= path.resolve(__dirname, "../hosting-data");
process.env.COCKPIT_ORIGIN ||= "https://betrieb.waermeverbund.ch";
process.env.HOST ||= "0.0.0.0";
process.env.COCKPIT_TRUST_PROXY ||= "1";
process.env.COCKPIT_MFA_ENABLED ||= "0";
// Ausdrücklich gewählter Hostingbetrieb ohne Malware-Prüfung.
process.env.COCKPIT_SCAN_MODE ||= "disabled";
