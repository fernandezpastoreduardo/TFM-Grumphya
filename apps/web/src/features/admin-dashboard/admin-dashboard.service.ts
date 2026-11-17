import { authenticatedFetch } from "../../infrastructure/auth/session";
import type { DashboardState } from "./admin-dashboard.models";
import {
  isAnonymousAnalyticsData,
  isContact,
  isDashboardData,
  isLighthouseQuality,
  isRecord,
} from "./admin-dashboard.validation";

const DASHBOARD_ENDPOINTS = [
  "/api/admin/dashboard",
  "/api/admin/contact-messages",
  "/api/admin/anonymous-analytics",
] as const;

export async function loadAdminDashboard(): Promise<
  Extract<DashboardState, { status: "ready" }>
> {
  const [
    dashboardResponse,
    contactsResponse,
    analyticsResponse,
    qualityResponse,
  ] = await Promise.all([
    authenticatedFetch(DASHBOARD_ENDPOINTS[0]),
    authenticatedFetch(DASHBOARD_ENDPOINTS[1]),
    authenticatedFetch(DASHBOARD_ENDPOINTS[2]),
    authenticatedFetch("/api/admin/web-quality").catch(() => null),
  ]);

  const [dashboardBody, contactsBody, analyticsBody, qualityBody]: [
    unknown,
    unknown,
    unknown,
    unknown,
  ] = await Promise.all([
    dashboardResponse.json(),
    contactsResponse.json(),
    analyticsResponse.json(),
    qualityResponse?.ok
      ? qualityResponse.json().catch(() => null)
      : Promise.resolve(null),
  ]);

  if (
    !dashboardResponse.ok ||
    !contactsResponse.ok ||
    !analyticsResponse.ok ||
    !isDashboardData(dashboardBody) ||
    !isAnonymousAnalyticsData(analyticsBody) ||
    !isRecord(contactsBody) ||
    !Array.isArray(contactsBody.messages) ||
    !contactsBody.messages.every(isContact)
  ) {
    throw new Error("Admin dashboard response is invalid.");
  }

  return {
    status: "ready",
    data: dashboardBody,
    messages: contactsBody.messages,
    anonymousAnalytics: analyticsBody,
    webQuality: isLighthouseQuality(qualityBody) ? qualityBody.runs : [],
  };
}
