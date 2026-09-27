export function EmptyPage({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">{icon}</div>
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{description}</p>
      </div>
    </div>
  );
}