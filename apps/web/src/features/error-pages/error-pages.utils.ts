import { DEFAULT_RATE_LIMIT_DETAIL, ERROR_COPY } from "./error-pages.constants";
import type { ErrorPageStatus } from "./error-pages.models";

export function renderDescription(
  status: ErrorPageStatus,
  detail: string | undefined,
): string {
  if (status !== "429") return ERROR_COPY[status].description;
  return detail?.trim() || DEFAULT_RATE_LIMIT_DETAIL;
}

export function goBack(): void {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign("/");
}
