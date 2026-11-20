import { useEffect } from "react";

const DEVELOPMENT_SECURITY_BADGE_TOKEN =
  "oKRH-ZltmA7YRYP2ttXFkIcOBPm4sGksI14GN8nPscc";
const DEVELOPMENT_SECURITY_BADGE_HOSTNAME = "grumphya.com";
const DEVELOPMENT_SECURITY_BADGE_REPORT_ID =
  "6bff5c3e-ff99-4f68-bfe9-fb5f5dfb2823";
const DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL =
  "https://desarrolloseguro.org/desarrollo-seguro/badge-widget.js";

function loadBadgeWidget() {
  const nonceScript =
    document.querySelector<HTMLScriptElement>("script[nonce]");
  const nonce = nonceScript?.nonce;
  if (!nonce) return () => undefined;

  const script = document.createElement("script");
  script.src = DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL;
  script.defer = true;
  script.nonce = nonce;
  document.body.append(script);

  return () => script.remove();
}

export function AccreditationSeal() {
  useEffect(() => loadBadgeWidget(), []);

  return (
    <a
      data-ds-verified-badge
      data-token={DEVELOPMENT_SECURITY_BADGE_TOKEN}
      data-hostname={DEVELOPMENT_SECURITY_BADGE_HOSTNAME}
      data-report-id={DEVELOPMENT_SECURITY_BADGE_REPORT_ID}
      hidden
    >
      Comprobando sello…
    </a>
  );
}
