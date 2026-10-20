import { describe, expect, it } from 'vitest';
import {
  runHandler,
  validateInvariants,
} from '../../../shared/src/handlers.js';

describe('safe consumer handlers', () => {
  it('accepts valid order, payment, and inventory events without mutating payloads', () => {
    const order = { orderId: 'o-1', amount: 22.5, items: [{ quantity: 1 }] };
    const before = { ...order, items: order.items.map((item) => ({ ...item })) };
    expect(runHandler('order-validation', order, { eventName: 'order.created' }).passed).toBe(true);
    expect(runHandler('payment-amount', { paymentId: 'p-1', amount: 10.25, currency: 'USD' }).passed).toBe(true);
    expect(runHandler('inventory-quantity', { productId: 'sku-1', quantity: 0 }).passed).toBe(true);
    expect(order).toEqual(before);
  });

  it('returns clear errors for missing IDs, invalid numeric values, and malformed payload types', () => {
    expect(runHandler('order-validation', {}).errors[0].code).toBe('ORDER_ID_REQUIRED');
    expect(runHandler('payment-amount', { paymentId: 'p1', amount: -1, currency: 'usd' }).errors.map((item) => item.code)).toEqual(expect.arrayContaining(['INVALID_PAYMENT_AMOUNT', 'INVALID_PAYMENT_CURRENCY']));
    expect(runHandler('inventory-quantity', { productId: 'sku-1', quantity: -1 }).errors[0].code).toBe('INVALID_INVENTORY_QUANTITY');
    expect(runHandler('order-validation', null).errors[0].code).toBe('INVALID_PAYLOAD_TYPE');
    expect(runHandler('missing-handler', {}).errors[0].code).toBe('UNSUPPORTED_HANDLER');
  });

  it('evaluates the supported declarative invariant types with explicit paths and messages', async () => {
    const { checkInvariants } = await import('../../../worker/src/engine/invariantChecker.js');
    const checks = checkInvariants([
      { path: 'payment.amount', operator: 'positiveNumber' },
      { path: 'payment.amount', operator: 'nonNegative' },
      { path: 'payment.currency', operator: 'oneOf', value: ['USD', 'CAD'] },
      { path: 'payment.amount', operator: 'fieldsEqual', otherPath: 'total' },
    ], { payment: { amount: 10, currency: 'USD' }, total: 10 });
    expect(checks.every((item) => item.passed)).toBe(true);
    expect(() => validateInvariants([{ path: 'amount', operator: 'execute' }])).toThrow();
    expect(() =>
      validateInvariants([{ path: 'amount', operator: 'fieldsEqual', otherPath: '__proto__.x' }]),
    ).toThrow();
  });
});
