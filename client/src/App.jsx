import { NavLink, Route, Routes } from 'react-router-dom';

const navigation = [
  { label: 'Overview', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: 'Event schemas', path: '/schemas' },
  { label: 'Consumers', path: '/consumers' },
  { label: 'Fixtures', path: '/fixtures' },
  { label: 'Test runs', path: '/test-runs' },
];

function Overview() {
  return <section className="welcome-card">
    <span className="eyebrow">PHASE 1 · FOUNDATION</span>
    <h2>Catch event contract breaks before they reach production.</h2>
    <p>Register event schemas, replay real payloads, and see exactly which consumers may be affected. EventGuard uses deterministic checks so every result can be reproduced.</p>
    <div className="callout"><span className="callout-dot" /> Your workspace is ready to configure. Project workflows are coming in Phase 2.</div>
  </section>;
}

function PlannedPage({ title }) {
  return <section className="welcome-card">
    <span className="eyebrow">PLANNED WORKFLOW</span>
    <h2>{title}</h2>
    <p>This section will connect to the EventGuard API as its workflow is implemented. It does not show sample data as if it were real.</p>
  </section>;
}

export default function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">E</span><span>eventguard<span className="brand-period">.</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><span className="workspace-avatar">L</span><span>Local workspace</span><span className="chevron">⌄</span></div>
      <nav className="navigation" aria-label="Main navigation">
        <div className="nav-section-label">MONITOR</div>
        {navigation.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span className="nav-icon">{item.label === 'Overview' ? '◫' : item.label === 'Projects' ? '▦' : item.label === 'Event schemas' ? '◇' : item.label === 'Consumers' ? '◎' : item.label === 'Fixtures' ? '⌘' : '◷'}</span>{item.label}</NavLink>)}
      </nav>
      <div className="sidebar-footer"><span className="health-dot" /> API foundation <span className="phase-tag">PHASE 1</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="breadcrumb-muted">Workspace</span><span className="breadcrumb-separator">/</span><span className="breadcrumb-current">EventGuard</span></div><div className="topbar-right"><span className="local-tag"><span /> LOCAL ENVIRONMENT</span><button className="avatar-button" aria-label="Local profile">L</button></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">EVENT SAFETY PLATFORM</div><h1>Build with confidence.</h1><p className="subtitle">Your event contracts, consumers, and replay checks in one place.</p></div><span className="version-chip">MVP · IN PROGRESS</span></div>
        <Routes><Route path="/" element={<Overview />} /><Route path="/projects" element={<PlannedPage title="Projects" />} /><Route path="/schemas" element={<PlannedPage title="Event schemas" />} /><Route path="/consumers" element={<PlannedPage title="Consumers" />} /><Route path="/fixtures" element={<PlannedPage title="Historical fixtures" />} /><Route path="/test-runs" element={<PlannedPage title="Test runs" />} /><Route path="*" element={<PlannedPage title="Page not found" />} /></Routes>
        <footer className="page-footer">EventGuard <span>·</span> Deterministic by design <span>·</span> Local development</footer>
      </div>
    </main>
  </div>;
}
