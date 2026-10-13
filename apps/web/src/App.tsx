import { Home } from "./views/home";
import { SectionPage } from "./views/section-page";

export function App() {
  return window.location.pathname === "/" ? (
    <Home />
  ) : (
    <SectionPage path={window.location.pathname} />
  );
}
