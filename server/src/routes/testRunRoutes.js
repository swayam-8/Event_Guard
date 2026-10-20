import { Router } from 'express';
import * as controller from '../controllers/testRunController.js';
import { asyncRoute } from '../utils/http.js';

export const testRunRouter = Router();
testRunRouter.post(
  '/projects/:projectId/test-runs',
  asyncRoute(controller.create),
);
testRunRouter.post(
  '/projects/:projectId/test-runs/preview',
  asyncRoute(controller.preview),
);
testRunRouter.get(
  '/projects/:projectId/test-runs',
  asyncRoute(controller.list),
);
testRunRouter.get(
  '/projects/:projectId/test-runs/:runId',
  asyncRoute(controller.get),
);
testRunRouter.get(
  '/projects/:projectId/test-runs/:runId/results',
  asyncRoute(controller.results),
);
testRunRouter.post(
  '/projects/:projectId/test-runs/:runId/cancel',
  asyncRoute(controller.cancel),
);
