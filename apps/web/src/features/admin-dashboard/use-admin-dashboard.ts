import { useEffect, useState } from "react";
import type { DashboardState } from "./admin-dashboard.models";
import { loadAdminDashboard } from "./admin-dashboard.service";

export function useAdminDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadAdminDashboard()
      .then((readyState) => {
        if (active) setState(readyState);
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
