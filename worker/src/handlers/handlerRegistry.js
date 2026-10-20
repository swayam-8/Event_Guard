import { handlerNames, runHandler } from '../../../shared/src/handlers.js';

export { handlerNames };

export function executeConsumer({ handlerType, payload, context = {} }) {
  return runHandler(handlerType, payload, context);
}
