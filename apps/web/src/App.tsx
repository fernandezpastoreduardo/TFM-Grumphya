import { lazy, Suspense, useEffect, useState } from "react";
import {
  ErrorPages,
  ErrorPagesBoundary,
  type ErrorPageStatus,
} from "./features/error-pages/error-pages";
import {
  authenticatedFetch,
  clearAccessToken,
  subscribeToSessionChanges,
} from "./infrastructure/auth/session";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "./shared/components/loading-skeleton";
import { CookieNotice } from "./features/cookie-notice/cookie-notice";
import { isPrerenderedPublicPath } from "./shared/prerendered-public-routes";
import { SectionPage } from "./views/section-page";
import { recordAnonymousPageView } from "./shared/utils/anonymous-analytics";

let activeSessionCheck: Promise<AuthenticatedRole | null> | null = null;

const Home = lazy(() =>
  import("./views/home").then((module) => ({ default: module.Home })),
);
const PublicScanPortal = lazy(() =>
  import("@grumphya/prototype-desarrollo-seguro-web").then((module) => ({
    default: module.PublicScanPortal,
  })),
);
const PREVIEW_ERROR_PATHS: Record<string, ErrorPageStatus> = {
  "/__preview/errors/404": "404",
  "/__preview/errors/429": "429",
  "/__preview/errors/500": "500",
};
const DEVELOPMENT_SECURITY_PORTAL_PATH = "/desarrollo-seguro/app";

type AuthenticatedRole = "user" | "admin";

export function App({ initialPath }: { initialPath?: string } = {}) {
  const path = initialPath ?? window.location.pathname;

  useEffect(() => recordAnonymousPageView(path), [path]);

  useEffect(
    () =>
      subscribeToSessionChanges(() => {
        clearAccessToken();
        window.location.reload();
      }),
    [],
  );

  return (
    <ErrorPagesBoundary>
      <>
        <Suspense
          fallback={
            <LoadingSkeleton
              label="Cargando Grumphya"
              className="app-loading-skeleton"
            >
              <SkeletonBlock className="skeleton-app-header" />
              <SkeletonBlock className="skeleton-app-heading" />
              <SkeletonBlock className="skeleton-app-copy" />
              <div className="skeleton-app-panels">
                <SkeletonBlock className="skeleton-app-panel main" />
                <SkeletonBlock className="skeleton-app-panel side" />
              </div>
            </LoadingSkeleton>
          }
        >
          <AppRoute path={path} />
        </Suspense>
        {path !== DEVELOPMENT_SECURITY_PORTAL_PATH && (
          <CookieNotice deferInitialStorage={isPrerenderedPublicPath(path)} />
        )}
      </>
    </ErrorPagesBoundary>
  );
}

function AppRoute({ path }: { path: string }) {
  if (path === DEVELOPMENT_SECURITY_PORTAL_PATH) return <PublicScanPortal />;
  if (import.meta.env.DEV && path in PREVIEW_ERROR_PATHS) {
    return <ErrorPages status={PREVIEW_ERROR_PATHS[path]} />;
  }
  if (path === "/") return <Home />;
  if (
    path !== "/login" &&
    path !== "/perfil" &&
    path !== "/crear-cuenta" &&
    path !== "/panel-control"
  ) {
    return <SectionPage path={path} />;
  }
  return <AuthenticatedRoute path={path} />;
}

function AuthenticatedRoute({ path }: { path: string }) {
  const [activeRole, setActiveRole] = useState<
    AuthenticatedRole | null | undefined
  >(undefined);

  useEffect(() => {
    let isMounted = true;
    getActiveSessionRole()
      .then((role) => {
        if (isMounted) setActiveRole(role);
      })
      .catch(() => {
        if (isMounted) setActiveRole(null);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const redirectPath = getAuthenticatedRouteRedirect(path, activeRole);

  useEffect(() => {
    if (redirectPath) window.location.replace(redirectPath);
  }, [redirectPath]);

  if (activeRole === undefined || redirectPath !== null) {
    return (
      <LoadingSkeleton
        label="Comprobando tu sesión"
        className="app-loading-skeleton"
      >
        <SkeletonBlock className="skeleton-app-header" />
        <SkeletonBlock className="skeleton-app-heading" />
        <SkeletonBlock className="skeleton-app-copy" />
        <div className="skeleton-app-panels">
          <SkeletonBlock className="skeleton-app-panel main" />
          <SkeletonBlock className="skeleton-app-panel side" />
        </div>
      </LoadingSkeleton>
    );
  }

  return <SectionPage path={path} />;
}

function getAuthenticatedRouteRedirect(
  path: string,
  role: AuthenticatedRole | null | undefined,
): string | null {
  if (role === undefined) return null;
  if (path === "/login" || path === "/crear-cuenta") {
    if (role === "admin") return "/panel-control";
    if (role === "user") return "/perfil";
  }
  if (path === "/perfil" && role === null) return "/login";
  if (path === "/panel-control") {
    if (role === null) return "/login";
    if (role === "user") return "/perfil";
  }
  return null;
}

function getActiveSessionRole(): Promise<AuthenticatedRole | null> {
  if (!activeSessionCheck) {
    activeSessionCheck = authenticatedFetch("/api/account/profile")
      .then(async (response) => {
        if (!response.ok) return null;
        const profile: unknown = await response.json();
        if (
          typeof profile !== "object" ||
          profile === null ||
          !("user" in profile) ||
          typeof profile.user !== "object" ||
          profile.user === null ||
          !("role" in profile.user) ||
          (profile.user.role !== "user" && profile.user.role !== "admin")
        ) {
          return null;
        }
        return profile.user.role;
      })
      .catch(() => null)
      .finally(() => {
        activeSessionCheck = null;
      });
  }
  return activeSessionCheck;
}
