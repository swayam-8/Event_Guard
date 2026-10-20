import mongoose from 'mongoose';
import { TestRun } from '../../../shared/src/models.js';
import { compareSchemas } from '../../../shared/src/compatibility.js';
import { replayFixtures } from '../engine/fixtureRunner.js';
import { buildReport } from '../engine/reportBuilder.js';

export async function processTestRun(runId) {
  const run = await TestRun.findOneAndUpdate(
    { _id: runId, status: 'queued', attempts: { $lt: 3 } },
    {
      $set: { status: 'running', startedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
  if (!run) return;
  try {
    const { schemas, consumers, fixtures } = run.inputSnapshot;
    const previous = schemas.find(
      (schema) => schema.version === run.fromVersion,
    );
    const next = schemas.find((schema) => schema.version === run.toVersion);
    const findings = compareSchemas(
      previous.schemaDefinition ?? previous.schema,
      next.schemaDefinition ?? next.schema,
      { oldVersion: previous.version, newVersion: next.version },
    ).map((item) => ({ type: 'compatibility', ...item }));
    const replay = replayFixtures({
      fixtures,
      schemas,
      consumers,
      toVersion: run.toVersion,
    });
    const report = buildReport(
      [...findings, ...replay.results],
      replay.summary,
    );
    const completedAt = new Date();
    await TestRun.findByIdAndUpdate(runId, {
      status: 'completed',
      outcome: report.outcome,
      results: report.results,
      summary: report.summary,
      completedAt,
      durationMs: completedAt - run.startedAt,
    });
  } catch (error) {
    const terminal = run.attempts >= 3;
    await TestRun.findOneAndUpdate(
      { _id: runId, status: 'running' },
      {
        status: terminal ? 'failed' : 'queued',
        errorMessage: terminal
          ? 'Test processing failed after three attempts.'
          : 'A processing attempt failed and will be retried.',
        ...(terminal
          ? { completedAt: new Date(), durationMs: Date.now() - run.startedAt }
          : {}),
      },
    );
    if (!terminal) throw error;
  }
}

export function validRunId(runId) {
  return mongoose.isValidObjectId(runId);
}
