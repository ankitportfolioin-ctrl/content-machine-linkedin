import { EmptyPage } from './EmptyPage';

export function BrainPage() {
  return (
    <EmptyPage
      title="Brain / Intelligence"
      description="Content intelligence, trend analysis, and learning engine will be implemented in future phases."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M12 8a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0v-1a3 3 0 0 1 3-3z" />
          <path d="M3 14a9 9 0 0 1 5.7-1.7 3 3 0 0 1 2.6 0 9 9 0 0 1 5.7 1.7" />
          <path d="M9 18a6 6 0 0 0 6 0" />
          <path d="M12 12v4" />
        </svg>
      }
    />
  );
}