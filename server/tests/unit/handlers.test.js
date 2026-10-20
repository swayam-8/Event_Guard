import { describe, expect, it } from 'vitest';
import {
  runHandler,
  validateInvariants,
} from '../../../shared/src/handlers.js';

describe('safe consumer handlers', () => {
  it('rejects missing order identifiers and invalid payments', () => {
    expect(
      runHandler('order-validation', {}).map(({ code }) => code),
    ).toContain('ORDER_ID_REQUIRED');
    expect(
      runHandler('payment-amount', { amount: -1 }).map(({ code }) => code),
    ).toContain('INVALID_PAYMENT_AMOUNT');
  });

  it('validates inventory quantities and restricts invariant operators', () => {
    expect(runHandler('inventory-quantity', { quantity: 2 })).toEqual([]);
    expect(() =>
      validateInvariants([{ path: 'quantity', operator: 'execute' }]),
    ).toThrow();
  });
});
