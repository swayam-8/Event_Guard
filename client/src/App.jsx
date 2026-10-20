import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  createProject,
  createResource,
  createTestRun,
  cancelTestRun,
  compareSchemas,
  deleteProject,
  deleteResource,
  getHealth,
  getProjects,
  getResource,
  getTestRun,
  updateConsumer,
  updateProject,
  validateSchemaPayload,
} from './api/eventGuardApi';

const navigation = [
  { label: 'Overview', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: 'Event schemas', path: '/schemas' },
  { label: 'Consumers', path: '/consumers' },
  { label: 'Fixtures', path: '/fixtures' },
  { label: 'Test runs', path: '/test-runs' },
];
const icons = ['◫', '▦', '◇', '◎', '⌘', '◷'];

function useWorkspace() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(
    localStorage.getItem('eventguard.projectId') ?? '',
  );
  const [error, setError] = useState('');
  const reload = async () => {
    try {
      const items = await getProjects();
      setProjects(items);
      if (!items.some((item) => item._id === projectId))
        setProjectId(items[0]?._id ?? '');
      setError('');
    } catch (reason) {
      setError(reason.message);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (projectId) localStorage.setItem('eventguard.projectId', projectId);
  }, [projectId]);
  return { projects, projectId, setProjectId, error, setError, reload };
}

function Notice({ error }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}
function Empty({ children }) {
  return <div className="empty-state">{children}</div>;
}
function Field({ label, ...props }) {
  return (
    <label className="field">
      {label}
      <input required {...props} />
    </label>
  );
}

function ProjectsPage({ workspace }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const edit = async (project) => {
    const name = window.prompt('Project name', project.name);
    if (name === null) return;
    try {
      await updateProject(project._id, { name, description: project.description });
      await workspace.reload();
    } catch (error) { workspace.setError(error.message); }
  };
  const remove = async (project) => {
    if (!window.confirm(`Delete ${project.name} and all its schemas, fixtures, consumers, and runs?`)) return;
    try {
      await deleteProject(project._id);
      if (workspace.projectId === project._id) workspace.setProjectId('');
      await workspace.reload();
    } catch (error) { workspace.setError(error.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const project = await createProject({ name, description });
      setName('');
      setDescription('');
      await workspace.reload();
      workspace.setProjectId(project._id);
    } catch (error) {
      workspace.setError(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Notice error={workspace.error} />
      <div className="section-grid">
        <section className="panel">
          <h2>Create a project</h2>
          <p>Keep event contracts and test results scoped to a project.</p>
          <form onSubmit={submit}>
            <Field
              label="Project name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Orders API"
            />
            <label className="field">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows="3"
              />
            </label>
            <button className="primary-button" disabled={saving}>
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>
            Your projects{' '}
            <span className="count-chip">{workspace.projects.length}</span>
          </h2>
          {workspace.projects.length ? (
            <div className="list">
              {workspace.projects.map((project) => (
                <button
                  key={project._id}
                  className={`list-row${workspace.projectId === project._id ? ' selected' : ''}`}
                  onClick={() => workspace.setProjectId(project._id)}
                >
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.description || 'No description'}</small>
                  </span>
                  <span className="row-actions">
                    <span className="quiet-button" onClick={(event) => { event.stopPropagation(); edit(project); }}>Edit</span>
                    <span className="quiet-button danger-action" onClick={(event) => { event.stopPropagation(); remove(project); }}>Delete</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>
              Create a project to register schemas, consumers, and fixtures.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}

function ResourcePage({ resource, workspace }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [eventName, setEventName] = useState('');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1');
  const [handler, setHandler] = useState('order-validation');
  const [payload, setPayload] = useState(
    '{\n  "orderId": "ord_1001",\n  "amount": 42.5,\n  "quantity": 2\n}',
  );
  const [schemaText, setSchemaText] = useState(
    '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {\n    "orderId": { "type": "string" },\n    "amount": { "type": "number" },\n    "quantity": { "type": "integer" }\n  },\n  "required": ["orderId"]\n}',
  );
  const [validationText, setValidationText] = useState('{\n  "orderId": "ord_1001",\n  "amount": 42.5,\n  "quantity": 2\n}');
  const [validationResult, setValidationResult] = useState(null);
  const [compareFrom, setCompareFrom] = useState('1');
  const [compareTo, setCompareTo] = useState('2');
  const [comparison, setComparison] = useState(null);
  const reload = async () => {
    if (!workspace.projectId) return;
    setLoading(true);
    try {
      setItems(await getResource(workspace.projectId, resource));
      setError('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, [workspace.projectId, resource]);
  const submit = async (event) => {
    event.preventDefault();
    if (!workspace.projectId) return;
    setSaving(true);
    try {
      const data =
        resource === 'schemas'
          ? {
              eventName,
              version: Number(version),
              schema: JSON.parse(schemaText),
            }
          : resource === 'consumers'
            ? {
                name,
                eventName,
                expectedSchemaVersion: Number(version),
                handler,
                enabled: true,
                invariants: [],
              }
            : {
                eventName,
                schemaVersion: Number(version),
                payload: JSON.parse(payload),
                description: name,
              };
      await createResource(workspace.projectId, resource, data);
      setName('');
      await reload();
    } catch (reason) {
      setError(reason.response?.data?.error?.message ?? reason.message);
    } finally {
      setSaving(false);
    }
  };
  const removeItem = async (item) => {
    if (!window.confirm('Delete this record?')) return;
    try { await deleteResource(workspace.projectId, resource, item._id); await reload(); }
    catch (reason) { setError(reason.message); }
  };
  const toggleConsumer = async (item) => {
    try { await updateConsumer(workspace.projectId, item._id, { enabled: !item.enabled }); await reload(); }
    catch (reason) { setError(reason.message); }
  };
  const validatePayload = async (event) => {
    event.preventDefault();
    try {
      const schema = items.find((item) => item._id === validationSchemaId);
      setValidationResult(await validateSchemaPayload(workspace.projectId, schema._id, JSON.parse(validationText)));
    } catch (reason) { setError(reason.message); }
  };
  const [validationSchemaId, setValidationSchemaId] = useState('');
  const compareVersions = async (event) => {
    event.preventDefault();
    try { setComparison(await compareSchemas(workspace.projectId, { eventName: compareEvent, fromVersion: Number(compareFrom), toVersion: Number(compareTo) })); }
    catch (reason) { setError(reason.message); }
  };
  const [compareEvent, setCompareEvent] = useState('');
  const title = {
    schemas: 'Event schemas',
    consumers: 'Consumers',
    fixtures: 'Historical fixtures',
  }[resource];
  if (!workspace.projectId)
    return (
      <Empty>
        Select or create a project before adding {title.toLowerCase()}.
      </Empty>
    );
  return (
    <>
      <Notice error={error} />
      <div className="section-grid">
        <section className="panel">
          <h2>
            Add{' '}
            {resource === 'schemas'
              ? 'a schema version'
              : resource === 'consumers'
                ? 'a consumer'
                : 'a fixture'}
          </h2>
          <form onSubmit={submit}>
            <Field
              label="Event name"
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="order.created"
            />
            {resource === 'consumers' && (
              <Field
                label="Consumer name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Billing service"
              />
            )}
            <Field
              label={
                resource === 'consumers'
                  ? 'Expected schema version'
                  : 'Schema version'
              }
              type="number"
              min="1"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
            {resource === 'schemas' && (
              <label className="field">
                JSON Schema
                <textarea
                  className="code-input"
                  value={schemaText}
                  onChange={(event) => setSchemaText(event.target.value)}
                  rows="10"
                />
              </label>
            )}
            {resource === 'fixtures' && (
              <>
                <Field
                  label="Description"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Historical order event"
                />
                <label className="field">
                  JSON payload
                  <textarea
                    className="code-input"
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    rows="8"
                  />
                </label>
              </>
            )}
            {resource === 'consumers' && (
              <label className="field">
                Safe handler
                <select
                  value={handler}
                  onChange={(event) => setHandler(event.target.value)}
                >
                  <option value="order-validation">Order validation</option>
                  <option value="payment-amount">Payment amount</option>
                  <option value="inventory-quantity">Inventory quantity</option>
                </select>
              </label>
            )}
            <button className="primary-button" disabled={saving}>
              {saving
                ? 'Saving…'
                : `Add ${resource === 'schemas' ? 'schema' : resource === 'consumers' ? 'consumer' : 'fixture'}`}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-title-row">
            <h2>{title}</h2>
            <button className="quiet-button" onClick={reload}>
              Refresh
            </button>
          </div>
          {loading ? (
            <Empty>Loading {title.toLowerCase()}…</Empty>
          ) : items.length ? (
            <ResourceList items={items} resource={resource} onDelete={removeItem} onToggle={toggleConsumer} />
          ) : (
            <Empty>No {title.toLowerCase()} in this project yet.</Empty>
          )}
        </section>
      </div>
      {resource === 'schemas' && <div className="section-grid api-tools-grid">
        <section className="panel"><h2>Validate a payload</h2><p>Check a JSON payload against a registered schema version.</p><form onSubmit={validatePayload}>
          <label className="field">Schema version<select required value={validationSchemaId} onChange={(event) => setValidationSchemaId(event.target.value)}><option value="">Choose schema</option>{items.map((item) => <option key={item._id} value={item._id}>{item.eventName} · v{item.version}</option>)}</select></label>
          <label className="field">Payload<textarea className="code-input" rows="6" value={validationText} onChange={(event) => setValidationText(event.target.value)} /></label><button className="primary-button" disabled={!items.length}>Validate payload</button>
        </form>{validationResult && <div className={`notice ${validationResult.valid ? 'success' : 'error'}`}>{validationResult.valid ? 'Payload is valid.' : `${validationResult.errors?.length ?? 0} validation error(s)`}{validationResult.errors?.map((item, index) => <small key={index}>{item.message}</small>)}</div>}</section>
        <section className="panel"><h2>Compare schema versions</h2><p>Review likely compatibility changes between two versions.</p><form onSubmit={compareVersions}><Field label="Event name" value={compareEvent} onChange={(event) => setCompareEvent(event.target.value)} placeholder="order.created" /><div className="field-pair"><Field label="From" type="number" min="1" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} /><Field label="To" type="number" min="2" value={compareTo} onChange={(event) => setCompareTo(event.target.value)} /></div><button className="primary-button">Compare versions</button></form>{comparison && <div className="finding-list">{comparison.findings.length ? comparison.findings.map((finding, index) => <article className="finding" key={index}><span className="finding-type">{finding.severity}</span><strong>{finding.message}</strong><small>{finding.path} · {finding.code}</small></article>) : <p>No compatibility findings detected.</p>}</div>}</section>
      </div>}
    </>
  );
}

function ResourceList({ items, resource, onDelete, onToggle }) {
  return (
    <div className="list">
      {items.map((item) => (
        <article className="list-row" key={item._id}>
          <span>
            <strong>
              {resource === 'schemas'
                ? `${item.eventName} · v${item.version}`
                : resource === 'consumers'
                  ? item.name
                  : `${item.eventName} · v${item.schemaVersion}`}
            </strong>
            <small>
              {resource === 'consumers'
                ? `${item.handler} · ${item.enabled ? 'enabled' : 'disabled'}`
                : resource === 'fixtures'
                  ? item.description || 'Historical fixture'
                  : `Created ${new Date(item.createdAt).toLocaleDateString()}`}
            </small>
          </span>
          <span className="row-actions">{resource === 'consumers' && <button className="quiet-button" onClick={() => onToggle(item)}>{item.enabled ? 'Disable' : 'Enable'}</button>}<button className="quiet-button danger-action" onClick={() => onDelete(item)}>Delete</button><span className="status-badge">
            {resource === 'schemas'
              ? 'SCHEMA'
              : resource === 'fixtures'
                ? 'FIXTURE'
                : item.enabled
                  ? 'ACTIVE'
                  : 'PAUSED'}
          </span></span>
        </article>
      ))}
    </div>
  );
}

function TestRunsPage({ workspace }) {
  const [schemas, setSchemas] = useState([]);
  const [runs, setRuns] = useState([]);
  const [eventName, setEventName] = useState('');
  const [fromVersion, setFromVersion] = useState('1');
  const [toVersion, setToVersion] = useState('2');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const reload = async () => {
    if (!workspace.projectId) return;
    try {
      const [schemaItems, runItems] = await Promise.all([
        getResource(workspace.projectId, 'schemas'),
        getResource(workspace.projectId, 'test-runs'),
      ]);
      setSchemas(schemaItems);
      setRuns(runItems);
      if (selectedRun?._id) {
        const updated = await getTestRun(workspace.projectId, selectedRun._id);
        setSelectedRun(updated);
      }
    } catch (reason) {
      setError(reason.message);
    }
  };
  useEffect(() => {
    setSelectedRun(null);
    reload();
  }, [workspace.projectId]);
  useEffect(() => {
    if (!runs.some((run) => ['queued', 'running'].includes(run.status)))
      return undefined;
    const timer = setInterval(reload, 2500);
    return () => clearInterval(timer);
  }, [runs, workspace.projectId]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const run = await createTestRun(workspace.projectId, {
        eventName,
        fromVersion: Number(fromVersion),
        toVersion: Number(toVersion),
      });
      setRuns((current) => [run, ...current]);
      setSelectedRun(run);
      setError('');
    } catch (reason) {
      setError(reason.response?.data?.error?.message ?? reason.message);
    } finally {
      setBusy(false);
    }
  };
  const openRun = async (run) => {
    try {
      setSelectedRun(await getTestRun(workspace.projectId, run._id));
    } catch (reason) {
      setError(reason.message);
    }
  };
  if (!workspace.projectId)
    return <Empty>Select or create a project before running checks.</Empty>;
  return (
    <>
      <Notice error={error} />
      <div className="section-grid">
        <section className="panel">
          <h2>Run compatibility checks</h2>
          <p>
            Compare two versions and replay this project's historical fixtures
            against the target.
          </p>
          <form onSubmit={submit}>
            <Field
              label="Event name"
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="order.created"
            />
            <div className="field-pair">
              <Field
                label="From version"
                type="number"
                min="1"
                value={fromVersion}
                onChange={(event) => setFromVersion(event.target.value)}
              />
              <Field
                label="To version"
                type="number"
                min="2"
                value={toVersion}
                onChange={(event) => setToVersion(event.target.value)}
              />
            </div>
            {schemas.length === 0 && (
              <div className="notice">
                Register at least two schema versions before starting a run.
              </div>
            )}
            <button
              className="primary-button"
              disabled={busy || schemas.length < 2}
            >
              {busy ? 'Queueing…' : 'Start test run'}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-title-row">
            <h2>Run history</h2>
            <button className="quiet-button" onClick={reload}>
              Refresh
            </button>
          </div>
          {runs.length ? (
            <div className="list">
              {runs.map((run) => (
                <button
                  className="list-row"
                  key={run._id}
                  onClick={() => openRun(run)}
                >
                  <span>
                    <strong>
                      {run.eventName} · v{run.fromVersion} → v{run.toVersion}
                    </strong>
                    <small>{new Date(run.createdAt).toLocaleString()}</small>
                  </span>
                  <span className={`status-badge ${run.outcome ?? run.status}`}>
                    {run.outcome ?? run.status}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>Test runs will appear here after they are queued.</Empty>
          )}
        </section>
      </div>
      {selectedRun && (
        <section className="panel report-panel">
          <div className="panel-title-row">
            <div>
              <div className="eyebrow">TEST REPORT</div>
              <h2>
                {selectedRun.eventName} · v{selectedRun.fromVersion} → v
                {selectedRun.toVersion}
              </h2>
            </div>
            <span
              className={`status-badge ${selectedRun.outcome ?? selectedRun.status}`}
            >
              {selectedRun.outcome ?? selectedRun.status}
            </span>
            {selectedRun.status === 'queued' && <button className="quiet-button danger-action" onClick={async () => { try { setSelectedRun(await cancelTestRun(workspace.projectId, selectedRun._id)); } catch (reason) { setError(reason.message); } }}>Cancel queued run</button>}
          </div>
          {selectedRun.status === 'queued' ||
          selectedRun.status === 'running' ? (
            <Empty>
              Worker is processing this run. This report refreshes
              automatically.
            </Empty>
          ) : (
            <>
              <div className="stat-grid">
                {Object.entries(selectedRun.summary ?? {}).map(
                  ([key, value]) => (
                    <div className="stat-card" key={key}>
                      <strong>{value}</strong>
                      <small>
                        {key.replace(
                          /[A-Z]/g,
                          (letter) => ` ${letter.toLowerCase()}`,
                        )}
                      </small>
                    </div>
                  ),
                )}
              </div>
              <div className="finding-list">
                {(selectedRun.results ?? []).map((result, index) => (
                  <article
                    className="finding"
                    key={`${result.type}-${result.fixtureId ?? result.path}-${index}`}
                  >
                    <span className="finding-type">{result.type}</span>
                    <strong>
                      {result.message ??
                        result.code ??
                        (result.passed === false
                          ? 'Consumer check failed'
                          : result.type === 'fixture'
                            ? `Fixture ${result.validAtTarget ? 'valid' : 'failed'} against v${selectedRun.toVersion}`
                            : 'Check passed')}
                    </strong>
                    <small>
                      {result.path ??
                        result.errors
                          ?.map((item) => item.message)
                          .join(' · ') ??
                        (result.fixtureId ? `Fixture ${result.fixtureId}` : '')}
                    </small>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Overview({ workspace, health }) {
  return (
    <>
      <Notice error={workspace.error} />
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="eyebrow">EVENT SAFETY PLATFORM / 01</span>
          <h2>Know what every event change will break.</h2>
          <p>
            Map contracts to consumers, replay historical payloads, and see the
            impact before a schema change reaches production.
          </p>
          <div className="callout">
            <span className="callout-dot" /> API{' '}
            {health ? 'connected' : 'unavailable'} · {workspace.projects.length}{' '}
            project{workspace.projects.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="event-map" aria-label="Event contract check flow">
          <div className="map-topline"><span>CONTRACT PIPELINE</span><span>LIVE MAP</span></div>
          <div className="map-node source-node"><span className="node-glyph">↗</span><span><strong>Event</strong><small>order.created</small></span></div>
          <div className="map-rail"><i /></div>
          <div className="map-node"><span className="node-glyph">◇</span><span><strong>Schema</strong><small>versioned contract</small></span><b className="node-state">01</b></div>
          <div className="map-rail"><i /></div>
          <div className="map-node"><span className="node-glyph">◎</span><span><strong>Consumers</strong><small>compatibility checks</small></span><b className="node-state">02</b></div>
          <div className="map-rail"><i /></div>
          <div className="map-node result-node"><span className="node-glyph">✓</span><span><strong>Replay report</strong><small>traceable result</small></span></div>
        </div>
      </section>
      <div className="overview-grid">
        <div className="panel">
          <span className="eyebrow">01 / SET YOUR SCOPE</span>
          <h3>Choose a project</h3>
          <p>
            Select a workspace project or create one to begin defining event
            contracts.
          </p>
        </div>
        <div className="panel">
          <span className="eyebrow">02 / CHECK THE CONTRACT</span>
          <h3>Reproducible checks</h3>
          <p>
            Schema validation and registered handlers determine outcomes.
            Compatibility findings are explicit heuristics.
          </p>
        </div>
        <div className="panel">
          <span className="eyebrow">03 / REPLAY WITH EVIDENCE</span>
          <h3>Separate execution</h3>
          <p>
            Test runs are queued to Kafka and processed by a separate worker
            with idempotent result writes.
          </p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const workspace = useWorkspace();
  const [health, setHealth] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  useEffect(() => {
    getHealth()
      .then(() => setHealth(true))
      .catch(() => setHealth(false));
  }, []);
  useEffect(() => {
    setActiveProject(
      workspace.projects.find((item) => item._id === workspace.projectId) ??
        null,
    );
  }, [workspace.projects, workspace.projectId]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">E</span>
          <span>
            eventguard<span className="brand-period">.</span>
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <label className="workspace-switch">
          <span className="workspace-avatar">
            {activeProject?.name?.[0]?.toUpperCase() ?? 'L'}
          </span>
          <select
            aria-label="Current project"
            value={workspace.projectId}
            onChange={(event) => workspace.setProjectId(event.target.value)}
          >
            <option value="">Select project</option>
            {workspace.projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <nav className="navigation" aria-label="Main navigation">
          <div className="nav-section-label">MONITOR</div>
          {navigation.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="nav-icon">{icons[index]}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={health ? 'health-dot' : 'health-dot offline'} />
          {health ? 'API connected' : 'API offline'}
          <span className="phase-tag">LOCAL</span>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="breadcrumb-muted">Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">
              {activeProject?.name ?? 'EventGuard'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-tag">
              <span /> LOCAL ENVIRONMENT
            </span>
            <button className="avatar-button" aria-label="Local profile">
              L
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">EVENT SAFETY PLATFORM</div>
              <h1>{activeProject?.name ?? 'Build with confidence.'}</h1>
              <p className="subtitle">
                Your event contracts, consumers, and replay checks in one place.
              </p>
            </div>
            <span className="version-chip">MVP · LOCAL</span>
          </div>
          <Routes>
            <Route
              path="/"
              element={<Overview workspace={workspace} health={health} />}
            />
            <Route
              path="/projects"
              element={<ProjectsPage workspace={workspace} />}
            />
            <Route
              path="/schemas"
              element={
                <ResourcePage resource="schemas" workspace={workspace} />
              }
            />
            <Route
              path="/consumers"
              element={
                <ResourcePage resource="consumers" workspace={workspace} />
              }
            />
            <Route
              path="/fixtures"
              element={
                <ResourcePage resource="fixtures" workspace={workspace} />
              }
            />
            <Route
              path="/test-runs"
              element={<TestRunsPage workspace={workspace} />}
            />
            <Route path="*" element={<Empty>Page not found.</Empty>} />
          </Routes>
          <footer className="page-footer">
            EventGuard <span>·</span> Deterministic by design <span>·</span>{' '}
            Local development
          </footer>
        </div>
      </main>
    </div>
  );
}
