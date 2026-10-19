import type { ReactNode } from "react";
import { useDelayedVisibility } from "../hooks/use-delayed-visibility";

type LoadingSkeletonProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

type SkeletonBlockProps = {
  className?: string;
};

export function LoadingSkeleton({
  label,
  children,
  className = "",
}: LoadingSkeletonProps) {
  const isVisible = useDelayedVisibility();

  return (
    <div
      className={`loading-skeleton ${className}`.trim()}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="loading-skeleton-label">{label}</span>
      {isVisible ? (
        <div className="loading-skeleton-content" aria-hidden="true">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: SkeletonBlockProps) {
  return <span className={`skeleton-block ${className}`.trim()} />;
}
