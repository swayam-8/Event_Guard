import { validatePayload } from '../../../shared/src/schemaValidator.js';
import { analyzeCompatibility } from './compatibilityEngine.js';
import { executeConsumer } from '../handlers/handlerRegistry.js';
import { checkInvariants } from './invariantChecker.js';

export class EngineInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EngineInputError';
    this.code = code;
  }
}

const schemaDefinition = (record) => record?.schemaDefinition ?? record?.schema;
const idOf = (record) => record?._id?.toString?.() ?? record?.id?.toString?.() ?? null;
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sortFindings = (items) => [...items].sort((a, b) =>
  compareText(a.path ?? '', b.path ?? '') ||
  compareText(a.code ?? '', b.code ?? '') ||
  compareText(a.severity ?? '', b.severity ?? ''),
);

/**
 * Replays each supplied historical fixture sequentially. A fixture invalid
 * under its own declared schema is reported as pre-existing and is not counted
 * as a target-version regression; consumer failures remain confirmed failures.
 */
export function replayFixtures({
  projectId,
  eventName,
  fixtures = [],
  schemas = [],
  consumers = [],
  toVersion,
  oldVersion = null,
  fromVersion = oldVersion,
  compatibilityPolicy,
  now = () => new Date(),
}) {
  const target = schemas.find((schema) => schema.version === toVersion && (!eventName || schema.eventName === eventName));
  if (!target || !schemaDefinition(target))
    throw new EngineInputError('TARGET_SCHEMA_NOT_FOUND', `Target schema version ${toVersion} was not supplied.`);
  const start = now();
  const compatibility = fromVersion === null ? null : (() => {
    const source = schemas.find((schema) => schema.version === fromVersion && (!eventName || schema.eventName === eventName));
    if (!source || !schemaDefinition(source)) return null;
    return analyzeCompatibility({
      oldSchema: schemaDefinition(source), oldVersion: source.version,
      newSchema: schemaDefinition(target), newVersion: target.version,
      policy: compatibilityPolicy,
    });
  })();

  const summary = {
    fixturesTested: 0, fixturesPassed: 0, fixturesFailed: 0,
    fixturesSkipped: 0, preExistingInvalidFixtures: 0,
    consumersTested: 0, consumersPassed: 0, consumersFailed: 0,
    consumersSkipped: 0, invariantViolations: 0,
  };
  const results = [];

  const orderedFixtures = [...fixtures].sort((a, b) => compareText(String(idOf(a) ?? ''), String(idOf(b) ?? '')));
  for (const fixture of orderedFixtures) {
    const fixtureId = idOf(fixture);
    if (projectId && String(fixture.projectId) !== String(projectId))
      throw new EngineInputError('CROSS_PROJECT_FIXTURE', `Fixture ${fixtureId ?? '(unknown)'} does not belong to the requested project.`);
    const fixtureEvent = fixture.eventName ?? eventName;
    if (eventName && fixtureEvent !== eventName) {
      summary.fixturesSkipped += 1;
      results.push({ type: 'fixture', fixtureId, eventName: fixtureEvent ?? null,
        originalSchemaVersion: fixture.schemaVersion, targetSchemaVersion: toVersion,
        outcome: 'skipped', findings: [{ code: 'EVENT_NAME_MISMATCH', severity: 'warning', path: '$', message: 'Fixture belongs to a different event and was not replayed.' }],
        consumerResults: [], invariantResults: [] });
      continue;
    }
    if (fixture.schemaVersion > toVersion) {
      summary.fixturesSkipped += 1;
      results.push({ type: 'fixture', fixtureId, eventName: fixtureEvent ?? null,
        originalSchemaVersion: fixture.schemaVersion, targetSchemaVersion: toVersion,
        outcome: 'skipped', findings: [{ code: 'FIXTURE_NEWER_THAN_TARGET', severity: 'info', path: '$', message: 'Fixture version is newer than the selected target.' }],
        consumerResults: [], invariantResults: [] });
      continue;
    }

    const source = schemas.find((schema) => schema.version === fixture.schemaVersion && (!eventName || schema.eventName === eventName));
    if (!source || !schemaDefinition(source)) {
      summary.fixturesSkipped += 1;
      results.push({ type: 'fixture', fixtureId, eventName: fixtureEvent ?? null,
        originalSchemaVersion: fixture.schemaVersion, targetSchemaVersion: toVersion,
        outcome: 'skipped', findings: [{ code: 'SOURCE_SCHEMA_NOT_FOUND', severity: 'warning', path: '$', message: 'The declared source schema was unavailable; fixture validation and replay were skipped.' }],
        consumerResults: [], invariantResults: [] });
      continue;
    }

    summary.fixturesTested += 1;
    const original = validatePayload(schemaDefinition(source), fixture.payload);
    const replay = validatePayload(schemaDefinition(target), fixture.payload);
    const findings = [];
    let preExistingInvalid = !original.valid;
    if (preExistingInvalid) {
      summary.preExistingInvalidFixtures += 1;
      findings.push({ code: 'PRE_EXISTING_INVALID_FIXTURE', severity: 'warning', path: '$',
        message: 'Fixture was already invalid under its declared source schema; target validation is not counted as a newly introduced regression.',
        errors: original.errors });
    }
    if (!replay.valid) {
      findings.push({ code: preExistingInvalid ? 'TARGET_SCHEMA_INVALID_PRE_EXISTING' : 'TARGET_SCHEMA_REJECTION',
        severity: preExistingInvalid ? 'info' : 'error', path: replay.errors[0]?.path ?? '$',
        message: preExistingInvalid ? 'The target schema also rejects this pre-existing invalid fixture.' : 'The target schema rejects an event that was valid under its declared source schema.',
        errors: replay.errors });
    }

    const matchingConsumers = consumers.filter((consumer) => !consumer.eventName || consumer.eventName === fixtureEvent);
    const applicable = matchingConsumers.filter((consumer) =>
      consumer.enabled !== false && (consumer.expectedSchemaVersion ?? 1) <= toVersion)
      .sort((a, b) => compareText(String(idOf(a) ?? ''), String(idOf(b) ?? '')));
    summary.consumersSkipped += matchingConsumers.filter((consumer) =>
      consumer.enabled === false || (consumer.expectedSchemaVersion ?? 1) > toVersion).length;
    const consumerResults = [];
    const invariantResults = [];
    for (const consumer of applicable) {
      summary.consumersTested += 1;
      const context = { projectId: projectId ?? null, eventName: fixtureEvent ?? null,
        fixtureId, consumerId: idOf(consumer), expectedSchemaVersion: consumer.expectedSchemaVersion ?? null };
      const execution = executeConsumer({
        handlerType: consumer.handlerType ?? consumer.handler,
        payload: fixture.payload,
        context,
      });
      const checks = checkInvariants(consumer.invariants ?? [], fixture.payload);
      invariantResults.push(...checks.map((check) => ({ ...check, consumerId: idOf(consumer) })));
      const errors = [...execution.errors, ...checks.filter((check) => !check.passed).map((check) => ({
        code: check.code, path: check.path, message: check.message, invariantId: check.id,
      }))];
      const passed = errors.length === 0;
      if (passed) summary.consumersPassed += 1;
      else summary.consumersFailed += 1;
      summary.invariantViolations += checks.filter((check) => !check.passed).length;
      consumerResults.push({ consumerId: idOf(consumer), fixtureId, name: consumer.name ?? null,
        handlerType: execution.handlerType, expectedSchemaVersion: consumer.expectedSchemaVersion ?? null,
        outcome: passed ? 'passed' : 'failed', passed, handler: execution,
        invariantResults: checks, findings: errors.map((error) => ({ ...error, severity: 'error' })) });
    }
    const failed = findings.some((finding) => finding.severity === 'error') || consumerResults.some((item) => !item.passed);
    const outcome = failed ? 'failed' : preExistingInvalid ? 'warning' : 'passed';
    if (outcome === 'failed') summary.fixturesFailed += 1;
    else if (outcome === 'passed') summary.fixturesPassed += 1;
    results.push({ type: 'fixture', fixtureId, eventName: fixtureEvent ?? null,
      originalSchemaVersion: fixture.schemaVersion, targetSchemaVersion: toVersion,
      schemaValidation: { original: original.valid ? 'passed' : 'failed', target: replay.valid ? 'passed' : 'failed', originalErrors: original.errors, targetErrors: replay.errors },
      preExistingInvalid, consumerResults, invariantResults,
      findings: sortFindings(findings), outcome });
  }
  const end = now();
  summary.failedFixtures = summary.fixturesFailed;
  summary.failedConsumers = summary.consumersFailed;
  return { direction: 'historical-event-to-target-schema-and-consumer',
    compatibility, results, summary,
    durationMs: Math.max(0, new Date(end).getTime() - new Date(start).getTime()) };
}
