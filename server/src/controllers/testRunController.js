import * as service from '../services/testRunService.js';
import { validatePreviewBody } from '../validators/requests.js';
import { sendData } from '../utils/http.js';

export const create = async (req, res) =>
  sendData(
    res,
    await service.createTestRun(req.params.projectId, req.body),
    202,
  );
export const list = async (req, res) =>
  sendData(res, await service.listTestRuns(req.params.projectId, req.query));
export const get = async (req, res) =>
  sendData(
    res,
    await service.getTestRun(req.params.projectId, req.params.runId),
  );
export const results = async (req, res) =>
  sendData(
    res,
    await service.getTestRun(req.params.projectId, req.params.runId, true),
  );
export const cancel = async (req, res) =>
  sendData(
    res,
    await service.cancelTestRun(req.params.projectId, req.params.runId),
  );
export const preview = async (req, res) =>
  sendData(
    res,
    await service.previewTestRun(req.params.projectId, validatePreviewBody(req.body)),
  );
