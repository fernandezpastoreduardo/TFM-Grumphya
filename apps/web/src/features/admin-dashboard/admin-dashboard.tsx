import { useState, type KeyboardEvent } from "react";
import {
  ADMIN_TABS,
  getNextTabIndex,
  type AdminTab,
} from "./admin-dashboard.validation";
import { AdminErrorDetail } from "./components/admin-error-detail";
import { AdminDashboardLoading } from "./components/admin-dashboard-loading";
import { SummaryTab } from "./tabs/summary-tab";
import {
  AnonymousAnalyticsTab,
  BenchmarkTab,
  LighthouseQualityTab,
  SecurityTab,
  TelemetryTab,
} from "./admin-dashboard-tabs";
import { useAdminDashboard } from "./use-admin-dashboard";
import "./admin-dashboard.scss";

const DASHBOARD_ERROR = "No se han podido consultar los datos del panel.";

export function AdminDashboard() {
  const errorEventId = new URLSearchParams(window.location.search).get("error");
  if (errorEventId !== null) {
    return <AdminErrorDetail eventId={errorEventId} />;
  }
  return <AdminDashboardOverview />;
}

function AdminDashboardOverview() {
  const state = useAdminDashboard();
  const [activeTab, setActiveTab] = useState<AdminTab>("summary");

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    const nextIndex = getNextTabIndex(currentIndex, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = ADMIN_TABS[nextIndex];
    setActiveTab(nextTab.id);
    const tabButtons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabButtons?.[nextIndex]?.focus();
  }

  if (state.status === "loading") return <AdminDashboardLoading />;
  if (state.status === "error") {
    return (
      <section className="admin-dashboard-error" role="alert">
        <h2>Panel no disponible</h2>
        <p>{DASHBOARD_ERROR}</p>
      </section>
    );
  }

  const { data, messages } = state;
  return (
    <div className="admin-dashboard">
      <section
        className="admin-dashboard-heading"
        aria-labelledby="admin-dashboard-title"
      >
        <span className="eyebrow">Zona de administración</span>
        <h2 id="admin-dashboard-title">Hola, Jappy.</h2>
        <p>
          Los ingresos son simulados. El coste de IA es una estimación basada en
          tokens registrados.
        </p>
      </section>
      <div
        className="admin-dashboard-tabs"
        role="tablist"
        aria-label="Secciones del panel"
      >
        {ADMIN_TABS.map((tab, index) => (
          <button
            aria-controls={"admin-panel-" + tab.id}
            aria-selected={activeTab === tab.id}
            id={"admin-tab-" + tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={"admin-tab-" + activeTab}
        className="admin-dashboard-tabpanel"
        id={"admin-panel-" + activeTab}
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "summary" ? (
          <SummaryTab data={data} messages={messages} />
        ) : null}
        {activeTab === "benchmark" ? <BenchmarkTab /> : null}
        {activeTab === "telemetry" ? <TelemetryTab data={data} /> : null}
        {activeTab === "security" ? <SecurityTab data={data} /> : null}
        {activeTab === "anonymous" ? (
          <AnonymousAnalyticsTab data={state.anonymousAnalytics} />
        ) : null}
        {activeTab === "web-quality" ? (
          <LighthouseQualityTab runs={state.webQuality} />
        ) : null}
      </section>
    </div>
  );
}
