import { useEffect, useRef } from "react";

const DEVELOPMENT_SECURITY_BADGE_TOKEN =
  "oKRH-ZltmA7YRYP2ttXFkIcOBPm4sGksI14GN8nPscc";
const DEVELOPMENT_SECURITY_BADGE_REPORT_ID =
  "6bff5c3e-ff99-4f68-bfe9-fb5f5dfb2823";
const DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL =
  "https://desarrolloseguro.org/desarrollo-seguro/badge-widget.js";
const LIGHTHOUSE_BADGE_SCRIPT_URL = "/__lighthouse/badge-widget.js";
const BADGE_IDLE_TIMEOUT_MS = 2_500;

function getBadgeScriptUrl() {
  return import.meta.env.VITE_GRUMPHYA_LHCI_FIXTURES === "1"
    ? LIGHTHOUSE_BADGE_SCRIPT_URL
    : DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL;
}

function loadBadgeWidget() {
  const nonceScript =
    document.querySelector<HTMLScriptElement>("script[nonce]");
  const nonce = nonceScript?.nonce;
  if (!nonce) return () => undefined;

  const script = document.createElement("script");
  script.src = getBadgeScriptUrl();
  script.defer = true;
  script.nonce = nonce;
  document.body.append(script);

  return () => script.remove();
}

function loadBadgeWidgetWhenIdle() {
  if (typeof window.requestIdleCallback !== "function") {
    return loadBadgeWidget();
  }

  let removeBadgeWidget: () => void = () => undefined;
  const callbackId = window.requestIdleCallback(
    () => {
      removeBadgeWidget = loadBadgeWidget();
    },
    { timeout: BADGE_IDLE_TIMEOUT_MS },
  );
  return () => {
    window.cancelIdleCallback(callbackId);
    removeBadgeWidget();
  };
}

export function AccreditationSeal() {
  const badgeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (badgeRef.current) {
      badgeRef.current.dataset.hostname = window.location.hostname;
    }
    return loadBadgeWidgetWhenIdle();
  }, []);

  return (
    <a
      ref={badgeRef}
      data-ds-verified-badge
      data-token={DEVELOPMENT_SECURITY_BADGE_TOKEN}
      data-report-id={DEVELOPMENT_SECURITY_BADGE_REPORT_ID}
      hidden
    >
      Comprobando sello…
    </a>
  );
}
