import { ErrorPages } from "../features/error-pages/error-pages";
import { SectionPageFrame } from "../shared/components/section-page-frame";
import { SECTION_PAGES } from "./section-pages/section-page-definitions";
import { SectionPageContent } from "./section-page-content";

export function SectionPage({ path }: { path: string }) {
  const page = SECTION_PAGES[path]?.meta;
  if (!page) return <ErrorPages status="404" />;
  return (
    <SectionPageFrame page={page} currentPath={path}>
      <SectionPageContent path={path} />
    </SectionPageFrame>
  );
}
