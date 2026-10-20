import mongoose from 'mongoose';
import { TestRun } from '../../../shared/src/models.js';
import { replayFixtures } from '../engine/fixtureRunner.js';
import { buildReport } from '../engine/reportBuilder.js';

export const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);

export async function processTestRun(runId, projectId) {
  const run = await TestRun.findOneAndUpdate(
    { _id: runId, ...(projectId ? { projectId } : {}), status: 'queued', attempts: { $lt: maxAttempts } },
    {
      $set: { status: 'running', startedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
  if (!run) {
    const existing = await TestRun.findOne({ _id: runId, projectId });
    if (!existing) {
      const error = new Error('Job references a missing or mismatched test run.');
      error.code = 'INVALID_RUN_REFERENCE';
      throw error;
    }
    // A duplicate delivery for running or terminal work is an idempotent no-op.
    return;
  }
  try {
    const { schemas, consumers, fixtures } = run.inputSnapshot;
    const replay = replayFixtures({
      projectId: run.projectId,
      eventName: run.eventName,
      fixtures,
      schemas,
      consumers,
      toVersion: run.toVersion,
      fromVersion: run.fromVersion,
    });
    const report = buildReport({
      testRunId: run.id,
      projectId: run.projectId,
      eventName: run.eventName,
      fromVersion: run.fromVersion,
      toVersion: run.toVersion,
      startedAt: run.startedAt,
      durationMs: Date.now() - run.startedAt,
      replay,
      compatibility: replay.compatibility,
    });
    const results = [
      ...(report.compatibility?.findings ?? []).map((item) => ({ type: 'compatibility', ...item })),
      ...report.fixtures.map((fixture) => ({ type: 'fixture', ...fixture })),
      ...report.consumers.map((consumer) => ({ type: 'consumer', ...consumer })),
      ...report.invariantViolations.map((item) => ({ type: 'invariant', ...item })),
    ];
    const completedAt = new Date();
    await TestRun.findOneAndUpdate(
      { _id: runId, status: 'running', attempts: run.attempts },
      {
        $set: {
          status: 'completed',
          outcome: report.outcome,
          results,
          report,
          summary: report.summary,
          completedAt,
          durationMs: completedAt - run.startedAt,
        },
      },
    );
  } catch (error) {
    const terminal = run.attempts >= maxAttempts;
    await TestRun.findOneAndUpdate(
      { _id: runId, status: 'running' },
      {
        status: terminal ? 'failed' : 'queued',
        errorMessage: terminal
          ? `Test processing failed after ${maxAttempts} attempts.`
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

export function validateJobMessage(message) {
  return Boolean(
    message &&
      message.version === 1 &&
      validRunId(message.runId) &&
      validRunId(message.projectId) &&
      typeof message.createdAt === 'string' &&
      Number.isFinite(Date.parse(message.createdAt)),
  );
}
