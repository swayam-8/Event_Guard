import { runHandler } from '../../../shared/src/handlers.js';

export const paymentHandler = (payload, context = {}) =>
  runHandler('payment-amount', payload, context);
