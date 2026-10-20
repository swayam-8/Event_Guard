const fail = (code, path, message) => ({ code, path, message });
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const handlers = {
  'order-validation': (event) => {
    const errors = [];
    if (typeof event.orderId !== 'string' || !event.orderId.trim())
      errors.push(fail('ORDER_ID_REQUIRED', '$.orderId', 'Order event requires a non-empty orderId.'));
    if (event.amount !== undefined && (typeof event.amount !== 'number' || !Number.isFinite(event.amount) || event.amount < 0))
      errors.push(fail('INVALID_ORDER_AMOUNT', '$.amount', 'Order amount must be a non-negative finite number.'));
    if (event.items !== undefined) {
      if (!Array.isArray(event.items)) errors.push(fail('INVALID_ORDER_ITEMS', '$.items', 'Order items must be an array.'));
      else event.items.forEach((item, index) => {
        if (!isRecord(item)) errors.push(fail('INVALID_ORDER_ITEM', `$.items[${index}]`, 'Each order item must be an object.'));
        else if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1)
          errors.push(fail('INVALID_ORDER_ITEM_QUANTITY', `$.items[${index}].quantity`, 'Order item quantity must be a positive integer.'));
      });
    }
    return errors;
  },
  'payment-amount': (event) => {
    const errors = [];
    if (typeof event.paymentId !== 'string' || !event.paymentId.trim())
      errors.push(fail('PAYMENT_ID_REQUIRED', '$.paymentId', 'Payment event requires a non-empty paymentId.'));
    if (typeof event.amount !== 'number' || !Number.isFinite(event.amount) || event.amount <= 0)
      errors.push(fail('INVALID_PAYMENT_AMOUNT', '$.amount', 'Payment amount must be a positive finite number.'));
    if (typeof event.currency !== 'string' || !/^[A-Z]{3}$/.test(event.currency))
      errors.push(fail('INVALID_PAYMENT_CURRENCY', '$.currency', 'Payment currency must be a three-letter uppercase code.'));
    return errors;
  },
  'inventory-quantity': (event) => {
    const errors = [];
    if (typeof event.productId !== 'string' || !event.productId.trim())
      errors.push(fail('PRODUCT_ID_REQUIRED', '$.productId', 'Inventory event requires a non-empty productId.'));
    if (typeof event.quantity !== 'number' || !Number.isSafeInteger(event.quantity) || event.quantity < 0)
      errors.push(fail('INVALID_INVENTORY_QUANTITY', '$.quantity', 'Inventory quantity must be a non-negative safe integer.'));
    return errors;
  },
};

export const handlerNames = Object.keys(handlers);

export function validateInvariants(invariants = []) {
  const operators = new Set(['exists', 'positiveNumber', 'nonNegative', 'equals', 'oneOf', 'fieldsEqual', 'greaterThan']);
  if (
    !Array.isArray(invariants) ||
    invariants.length > 20 ||
    invariants.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        Object.keys(item).some((key) => !['path', 'otherPath', 'operator', 'value', 'message'].includes(key)) ||
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
        (['equals', 'oneOf'].includes(item.operator) && item.value === undefined) ||
        (item.operator === 'oneOf' && (!Array.isArray(item.value) || item.value.length > 100)) ||
        (item.operator === 'greaterThan' && !Number.isFinite(item.value)) ||
        (item.operator === 'fieldsEqual' && (typeof item.otherPath !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$/.test(item.otherPath) || item.otherPath.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)))) ||
        (item.operator !== 'fieldsEqual' && item.otherPath !== undefined) ||
        (item.message !== undefined &&
          (typeof item.message !== 'string' || item.message.length > 200)),
    )
  )
    throw new Error(
      'Invariants must be an array of up to 20 supported declarative path checks.',
    );
}
export function runHandler(name, payload, context = {}) {
  const handler = handlers[name];
  if (!handler)
    return { handlerType: name, passed: false, context, errors: [fail('UNSUPPORTED_HANDLER', '$', `Unsupported consumer handler: ${String(name)}.`)] };
  if (!isRecord(payload))
    return { handlerType: name, passed: false, context, errors: [fail('INVALID_PAYLOAD_TYPE', '$', 'Consumer payload must be a JSON object.')] };
  const errors = handler(payload);
  return { handlerType: name, passed: errors.length === 0, context, errors };
}
