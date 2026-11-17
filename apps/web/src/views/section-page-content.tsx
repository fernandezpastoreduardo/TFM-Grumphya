import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../shared/components/loading-skeleton";
import { SECTION_PAGES } from "./section-pages/section-page-definitions";

const SECTION_CONTENT_BY_PATH: Record<
  string,
  LazyExoticComponent<ComponentType>
> = Object.fromEntries(
  Object.entries(SECTION_PAGES).map(([path, section]) => [
    path,
    lazy(section.load),
  ]),
);

const DEFAULT_SECTION_CONTENT = lazy(() =>
  import("../features/authentication/authentication-page").then((module) => ({
    default: module.AuthenticationPage,
  })),
);

export function SectionPageContent({ path }: { path: string }) {
  const Content = SECTION_CONTENT_BY_PATH[path] ?? DEFAULT_SECTION_CONTENT;
  return (
    <Suspense
      fallback={
        <LoadingSkeleton
          label="Preparando esta sección"
          className="section-content-skeleton"
        >
          <SkeletonBlock className="skeleton-section-eyebrow" />
          <SkeletonBlock className="skeleton-section-heading" />
          <SkeletonBlock className="skeleton-section-copy" />
          <div className="skeleton-section-panels">
            <SkeletonBlock className="skeleton-section-panel main" />
            <SkeletonBlock className="skeleton-section-panel side" />
          </div>
        </LoadingSkeleton>
      }
    >
      <Content />
    </Suspense>
  );
}
