import { NOTICE_ACKNOWLEDGED_KEY } from "./cookie-notice.constants";

export function hasAcknowledgedNotice(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_ACKNOWLEDGED_KEY) === "true";
  } catch {
    return false;
  }
}

export function recordNoticeAcknowledgement(): void {
  try {
    window.localStorage.setItem(NOTICE_ACKNOWLEDGED_KEY, "true");
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}
