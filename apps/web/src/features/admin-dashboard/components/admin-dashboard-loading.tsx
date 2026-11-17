import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";

export function AdminDashboardLoading() {
  return (
    <LoadingSkeleton
      label="Cargando el panel de administración"
      className="admin-dashboard-skeleton"
    >
      <div className="admin-dashboard-skeleton-heading">
        <SkeletonBlock className="skeleton-admin-eyebrow" />
        <SkeletonBlock className="skeleton-admin-title" />
        <SkeletonBlock className="skeleton-admin-copy" />
      </div>
      <div className="admin-metrics">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="admin-metric admin-metric-skeleton" key={index}>
            <SkeletonBlock className="skeleton-admin-label" />
            <SkeletonBlock className="skeleton-admin-value" />
          </div>
        ))}
      </div>
      <div className="admin-dashboard-card admin-table-skeleton">
        <SkeletonBlock className="skeleton-admin-title" />
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock className="skeleton-admin-table-row" key={index} />
        ))}
      </div>
      <div className="admin-dashboard-card admin-contacts-skeleton">
        <SkeletonBlock className="skeleton-admin-title" />
        {Array.from({ length: 2 }, (_, index) => (
          <SkeletonBlock className="skeleton-admin-contact" key={index} />
        ))}
      </div>
    </LoadingSkeleton>
  );
}
