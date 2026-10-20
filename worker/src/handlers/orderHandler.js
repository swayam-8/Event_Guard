import { runHandler } from '../../../shared/src/handlers.js';

export const orderHandler = (payload, context = {}) =>
  runHandler('order-validation', payload, context);
