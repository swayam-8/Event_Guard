import { runHandler } from '../../../shared/src/handlers.js';
import { validatePayload } from '../../../shared/src/schemaValidator.js';
import { checkInvariants } from './invariantChecker.js';

export function replayFixtures({ fixtures, schemas, consumers, toVersion }) {
  const results = [];
  const summary = {
    fixturesTested: 0,
    consumersTested: 0,
    failedFixtures: 0,
    failedConsumers: 0,
    invariantViolations: 0,
  };
  for (const fixture of fixtures.filter(
    (item) => item.schemaVersion <= toVersion,
  )) {
    const sourceSchema = schemas.find(
      (schema) => schema.version === fixture.schemaVersion,
    );
    const targetSchema = schemas.find((schema) => schema.version === toVersion);
    if (!sourceSchema || !targetSchema) continue;
    summary.fixturesTested += 1;
    const sourceResult = validatePayload(
      sourceSchema.schemaDefinition ?? sourceSchema.schema,
      fixture.payload,
    );
    const replayResult = validatePayload(
      targetSchema.schemaDefinition ?? targetSchema.schema,
      fixture.payload,
    );
    if (!sourceResult.valid || !replayResult.valid) summary.failedFixtures += 1;
    results.push({
      type: 'fixture',
      fixtureId: String(fixture._id),
      schemaVersion: fixture.schemaVersion,
      targetSchemaVersion: toVersion,
      validAtSource: sourceResult.valid,
      validAtTarget: replayResult.valid,
      errors: replayResult.errors,
    });
    for (const consumer of consumers.filter(
      (candidate) => candidate.expectedSchemaVersion <= toVersion,
    )) {
      summary.consumersTested += 1;
      const errors = [
        ...runHandler(
          consumer.handlerType ?? consumer.handler,
          fixture.payload,
        ),
        ...checkInvariants(consumer.invariants ?? [], fixture.payload),
      ];
      summary.invariantViolations += errors.filter(
        (item) => item.code === 'INVARIANT_VIOLATION',
      ).length;
      const passed = errors.length === 0 && replayResult.valid;
      if (!passed) summary.failedConsumers += 1;
      results.push({
        type: 'consumer',
        consumerId: String(consumer._id),
        fixtureId: String(fixture._id),
        schemaVersion: fixture.schemaVersion,
        targetSchemaVersion: toVersion,
        handlerType: consumer.handlerType ?? consumer.handler,
        passed,
        errors: [
          ...errors,
          ...(!replayResult.valid ? replayResult.errors : []),
        ],
      });
    }
  }
  return { results, summary };
}
