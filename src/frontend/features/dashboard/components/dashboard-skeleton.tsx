"use client";

export function DashboardSkeleton() {
  return (
    <div className="dashboard-frame">
      {/* Sidebar skeleton */}
      <aside className="sidebar">
        <div className="brand">
          <div className="skeleton skeleton-circle" />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-title" />
          </div>
        </div>
        <nav className="nav">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48, margin: "4px 12px", borderRadius: 5 }} />
          ))}
        </nav>
      </aside>

      {/* Main area skeleton */}
      <section className="main-area">
        {/* Topbar skeleton */}
        <header className="topbar">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, width: 140, borderRadius: 8 }} />
          ))}
          <div className="skeleton" style={{ height: 40, width: 200, borderRadius: 8, marginLeft: "auto" }} />
        </header>

        {/* Operational strip skeleton */}
        <section className="ops-strip">
          <div className="skeleton" style={{ height: 32, width: 280, borderRadius: 6 }} />
          <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 32, width: 90, borderRadius: 6 }} />
            ))}
          </div>
        </section>

        {/* KPIs skeleton */}
        <section className="loading-kpis">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-kpi" />
          ))}
        </section>

        {/* Content grid skeleton */}
        <section className="content-grid">
          <section className="left-col">
            <div className="skeleton skeleton-panel" />
            <div className="loading-section">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton-match-row" />
              ))}
            </div>
            <div className="skeleton skeleton-panel" />
          </section>

          <section className="center-col">
            <div className="skeleton skeleton-panel" style={{ height: 320 }} />
            <div className="skeleton skeleton-panel" />
          </section>

          <section className="right-col">
            <div className="skeleton skeleton-panel" style={{ height: 380 }} />
            <div className="skeleton skeleton-panel" />
          </section>
        </section>
      </section>
    </div>
  );
}
