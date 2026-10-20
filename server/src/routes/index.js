import { Router } from 'express';
import * as controller from '../controllers/resourceController.js';
import { testRunRouter } from './testRunRoutes.js';
import { asyncRoute } from '../utils/http.js';

export const apiRouter = Router();

apiRouter.post('/projects', asyncRoute(controller.createProject));
apiRouter.get('/projects', asyncRoute(controller.listProjects));
apiRouter.get('/projects/:projectId', asyncRoute(controller.getProject));
apiRouter.patch('/projects/:projectId', asyncRoute(controller.updateProject));
apiRouter.delete('/projects/:projectId', asyncRoute(controller.deleteProject));

apiRouter.post(
  '/projects/:projectId/schemas',
  asyncRoute(controller.createSchema),
);
apiRouter.get(
  '/projects/:projectId/schemas',
  asyncRoute(controller.listSchemas),
);
apiRouter.get(
  '/projects/:projectId/schemas/:schemaId',
  asyncRoute(controller.getSchema),
);
apiRouter.post(
  '/projects/:projectId/schemas/:schemaId/validate',
  asyncRoute(controller.validateSchema),
);
apiRouter.post(
  '/projects/:projectId/schemas/compare',
  asyncRoute(controller.compareSchemas),
);

apiRouter.post(
  '/projects/:projectId/consumers',
  asyncRoute(controller.createConsumer),
);
apiRouter.get(
  '/projects/:projectId/consumers',
  asyncRoute(controller.listConsumers),
);
apiRouter.patch(
  '/projects/:projectId/consumers/:consumerId',
  asyncRoute(controller.updateConsumer),
);
apiRouter.delete(
  '/projects/:projectId/consumers/:consumerId',
  asyncRoute(controller.deleteConsumer),
);

apiRouter.post(
  '/projects/:projectId/fixtures',
  asyncRoute(controller.createFixture),
);
apiRouter.get(
  '/projects/:projectId/fixtures',
  asyncRoute(controller.listFixtures),
);
apiRouter.get(
  '/projects/:projectId/fixtures/:fixtureId',
  asyncRoute(controller.getFixture),
);
apiRouter.delete(
  '/projects/:projectId/fixtures/:fixtureId',
  asyncRoute(controller.deleteFixture),
);

// Test-run processing predates this phase; keep it isolated and unchanged.
apiRouter.use(testRunRouter);
