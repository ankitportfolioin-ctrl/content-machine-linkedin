import { EmptyPage } from './EmptyPage';

export function AnalyticsPage() {
  return (
    <EmptyPage
      title="Analytics"
      description="Performance analytics and reporting will be implemented in future phases."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      }
    />
  );
}