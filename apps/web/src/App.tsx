import { lazy, Suspense } from "react";

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
      {window.location.pathname === "/" ? (
        <Home />
      ) : (
        <SectionPage path={window.location.pathname} />
      )}
    </Suspense>
  );
}
