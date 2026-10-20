const handlers = {
  'order-validation': (event) =>
    event?.orderId
      ? []
      : [
          {
            code: 'ORDER_ID_REQUIRED',
            message: 'Order event is missing orderId.',
          },
        ],
  'payment-amount': (event) =>
    Number.isFinite(event?.amount) && event.amount > 0
      ? []
      : [
          {
            code: 'INVALID_PAYMENT_AMOUNT',
            message: 'Payment amount must be a positive number.',
          },
        ],
  'inventory-quantity': (event) =>
    Number.isInteger(event?.quantity) && event.quantity >= 0
      ? []
      : [
          {
            code: 'INVALID_INVENTORY_QUANTITY',
            message: 'Inventory quantity must be a non-negative integer.',
          },
        ],
};

export const handlerNames = Object.keys(handlers);
export function validateInvariants(invariants = []) {
  const operators = new Set(['equals', 'greaterThan', 'exists']);
  if (
    !Array.isArray(invariants) ||
    invariants.length > 20 ||
    invariants.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        Object.keys(item).some(
          (key) => !['path', 'operator', 'value', 'message'].includes(key),
        ) ||
        typeof item.path !== 'string' ||
        item.path.length > 200 ||
        !/^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$/.test(
          item.path,
        ) ||
        item.path
          .split('.')
          .some((part) =>
            ['__proto__', 'prototype', 'constructor'].includes(part),
          ) ||
        !operators.has(item.operator) ||
        (item.operator === 'equals' && item.value === undefined) ||
        (item.operator === 'greaterThan' && !Number.isFinite(item.value)) ||
        (item.message !== undefined &&
          (typeof item.message !== 'string' || item.message.length > 200)),
    )
  )
    throw new Error(
      'Invariants must be an array of up to 20 path checks using equals, greaterThan, or exists.',
    );
}
export function runHandler(name, payload) {
  const handler = handlers[name];
  if (!handler) throw new Error(`Unsupported consumer handler: ${name}`);
  return handler(payload);
}
