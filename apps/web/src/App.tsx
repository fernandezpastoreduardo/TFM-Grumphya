import { lazy, Suspense, useEffect, useState } from "react";
import { authenticatedFetch } from "./infrastructure/auth/session";

let activeSessionCheck: Promise<boolean> | null = null;

const Home = lazy(() =>
  import("./views/home").then((module) => ({ default: module.Home })),
);
const SectionPage = lazy(() =>
  import("./views/section-page").then((module) => ({
    default: module.SectionPage,
  })),
);

export function App() {
  return (
    <Suspense
      fallback={
        <p className="route-loading" role="status" aria-live="polite">
          Cargando Grumphya…
        </p>
      }
    >
      <AppRoute />
    </Suspense>
  );
}

function AppRoute() {
  const path = window.location.pathname;
  if (path === "/") return <Home />;
  if (path !== "/login" && path !== "/perfil") {
    return <SectionPage path={path} />;
  }
  return <AuthenticatedRoute path={path} />;
}

function AuthenticatedRoute({ path }: { path: string }) {
  const [hasActiveSession, setHasActiveSession] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;
    getActiveSessionStatus()
      .then((isActive) => {
        if (isMounted) setHasActiveSession(isActive);
      })
      .catch(() => {
        if (isMounted) setHasActiveSession(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasActiveSession === null) return;
    if (path === "/login" && hasActiveSession) {
      window.location.replace("/perfil");
    } else if (path === "/perfil" && !hasActiveSession) {
      window.location.replace("/login");
    }
  }, [hasActiveSession, path]);

  if (
    hasActiveSession === null ||
    (path === "/login" && hasActiveSession) ||
    (path === "/perfil" && !hasActiveSession)
  ) {
    return (
      <p className="route-loading" role="status" aria-live="polite">
        Comprobando tu sesión…
      </p>
    );
  }

  return <SectionPage path={path} />;
}

function getActiveSessionStatus(): Promise<boolean> {
  if (!activeSessionCheck) {
    activeSessionCheck = authenticatedFetch("/api/account/profile")
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        activeSessionCheck = null;
      });
  }
  return activeSessionCheck;
}
