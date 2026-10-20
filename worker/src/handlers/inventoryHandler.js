import { runHandler } from '../../../shared/src/handlers.js';

export const inventoryHandler = (payload, context = {}) =>
  runHandler('inventory-quantity', payload, context);
