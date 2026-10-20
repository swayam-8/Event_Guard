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
        !item || typeof item.path !== 'string' || !operators.has(item.operator),
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
