const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const byFinding = (a, b) =>
  compareText(a.path ?? '', b.path ?? '') ||
  compareText(a.code ?? '', b.code ?? '') ||
  compareText(a.severity ?? '', b.severity ?? '') ||
  compareText(a.message ?? '', b.message ?? '');

function fromLegacy(results, summary) {
  const ordered = [...results].sort((a, b) =>
    compareText(a.type ?? '', b.type ?? '') ||
    compareText(String(a.fixtureId ?? ''), String(b.fixtureId ?? '')) ||
    compareText(String(a.consumerId ?? ''), String(b.consumerId ?? '')) || byFinding(a, b));
  const compatibility = ordered.filter((item) => item.type === 'compatibility');
  const failed = (summary.failedFixtures ?? 0) > 0 || (summary.failedConsumers ?? 0) > 0 ||
    compatibility.some((item) => item.severity === 'error' || item.severity === 'breaking');
  return {
    outcome: failed ? 'fail' : compatibility.length ? 'warning' : 'pass',
    summary: { ...summary, compatibilityFindings: compatibility.length },
    results: ordered,
  };
}

/** Build a reproducible report without including event payloads. */
export function buildReport(input, legacySummary) {
  if (Array.isArray(input)) return fromLegacy(input, legacySummary ?? {});
  const {
    testRunId = null, projectId = null, eventName = null,
    fromVersion = null, toVersion = null, startedAt = new Date(),
    durationMs = null, replay = { results: [], summary: {} },
    compatibility = null, generatedAt = () => new Date(),
  } = input ?? {};
  const fixtureResults = [...(replay.results ?? [])].sort((a, b) =>
    compareText(String(a.fixtureId ?? ''), String(b.fixtureId ?? '')));
  const consumerResults = fixtureResults.flatMap((fixture) => fixture.consumerResults ?? [])
    .sort((a, b) => compareText(String(a.consumerId ?? ''), String(b.consumerId ?? '')) ||
      compareText(String(a.fixtureId ?? ''), String(b.fixtureId ?? '')));
  const compatibilityFindings = [...(compatibility?.findings ?? [])].sort(byFinding);
  const invariantViolations = fixtureResults.flatMap((fixture) => fixture.invariantResults ?? [])
    .filter((item) => !item.passed).sort(byFinding);
  const summary = {
    fixturesTested: replay.summary?.fixturesTested ?? 0,
    fixturesPassed: replay.summary?.fixturesPassed ?? 0,
    fixturesFailed: replay.summary?.fixturesFailed ?? 0,
    fixturesSkipped: replay.summary?.fixturesSkipped ?? 0,
    preExistingInvalidFixtures: replay.summary?.preExistingInvalidFixtures ?? 0,
    consumersTested: replay.summary?.consumersTested ?? 0,
    consumersPassed: replay.summary?.consumersPassed ?? 0,
    consumersFailed: replay.summary?.consumersFailed ?? 0,
    consumersSkipped: replay.summary?.consumersSkipped ?? 0,
    invariantViolations: invariantViolations.length,
    compatibilityFindings: compatibilityFindings.length,
  };
  const confirmedFailure = summary.fixturesFailed > 0 || summary.consumersFailed > 0 ||
    compatibilityFindings.some((item) => item.severity === 'error');
  const unresolved = summary.fixturesSkipped > 0 || summary.consumersSkipped > 0 ||
    summary.preExistingInvalidFixtures > 0 || !compatibility?.analysisComplete ||
    compatibilityFindings.some((item) => item.severity === 'warning' || item.severity === 'info');
  const outcome = confirmedFailure ? 'fail' : unresolved ? 'warning' : 'pass';
  const testedSchemaVersions = [...new Set([fromVersion, toVersion].filter((item) => item !== null))].sort((a, b) => a - b);
  return {
    testRunId: testRunId === null ? null : String(testRunId),
    projectId: projectId === null ? null : String(projectId),
    eventName,
    fromVersion,
    toVersion,
    testedSchemaVersions,
    direction: 'old-valid-to-new-valid; replayed events are also run through applicable consumer handlers',
    executionStatus: 'completed',
    outcome,
    startedAt: new Date(startedAt).toISOString(),
    executedAt: generatedAt().toISOString(),
    durationMs: Number.isFinite(durationMs) ? durationMs : replay.durationMs ?? null,
    summary,
    compatibility: compatibility ? {
      compatible: compatibility.compatible,
      analysisComplete: compatibility.analysisComplete,
      findings: compatibilityFindings,
    } : null,
    fixtures: fixtureResults,
    consumers: consumerResults,
    invariantViolations,
  };
}
