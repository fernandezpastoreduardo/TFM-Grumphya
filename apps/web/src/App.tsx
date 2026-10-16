import { lazy, Suspense } from "react";
import {
  ErrorPages,
  ErrorPagesBoundary,
  type ErrorPageStatus,
} from "./features/error-pages/error-pages";

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
    <ErrorPagesBoundary>
      <Suspense
        fallback={
          <p className="route-loading" role="status" aria-live="polite">
            Cargando Grumphya…
          </p>
        }
      >
        {renderCurrentRoute()}
      </Suspense>
    </ErrorPagesBoundary>
  );
}

const PREVIEW_ERROR_PATHS: Record<string, ErrorPageStatus> = {
  "/__preview/errors/404": "404",
  "/__preview/errors/429": "429",
  "/__preview/errors/500": "500",
};

function renderCurrentRoute() {
  const path = window.location.pathname;
  if (import.meta.env.DEV && path in PREVIEW_ERROR_PATHS) {
    return <ErrorPages status={PREVIEW_ERROR_PATHS[path]} />;
  }
  return path === "/" ? <Home /> : <SectionPage path={path} />;
}
