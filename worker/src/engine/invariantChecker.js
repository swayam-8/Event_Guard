import { validateInvariants } from '../../../shared/src/handlers.js';

function readPath(payload, path) {
  return path.split('.').reduce((current, key) => current?.[key], payload);
}
function equalJson(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equalJson(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
      key === rightKeys[index] && equalJson(left[key], right[key]));
  }
  return false;
}

export function checkInvariants(invariants = [], payload = {}) {
  validateInvariants(invariants);
  return invariants.map((invariant, index) => {
    const value = readPath(payload, invariant.path);
    const other = invariant.operator === 'fieldsEqual'
      ? readPath(payload, invariant.otherPath) : undefined;
    const passed = (() => {
      switch (invariant.operator) {
        case 'exists': return value !== undefined && value !== null;
        case 'positiveNumber': return typeof value === 'number' && Number.isFinite(value) && value > 0;
        case 'nonNegative': return typeof value === 'number' && Number.isFinite(value) && value >= 0;
        case 'greaterThan': return typeof value === 'number' && Number.isFinite(value) && value > invariant.value;
        case 'equals': return value !== undefined && equalJson(value, invariant.value);
        case 'oneOf': return value !== undefined && invariant.value.some((item) => equalJson(item, value));
        case 'fieldsEqual': return typeof value === 'number' && Number.isFinite(value) && typeof other === 'number' && Number.isFinite(other) && value === other;
        default: return false;
      }
    })();
    return {
      id: invariant.id ?? `invariant-${index + 1}`,
      operator: invariant.operator,
      path: invariant.path,
      otherPath: invariant.otherPath ?? null,
      status: passed ? 'passed' : 'failed',
      passed,
      code: passed ? null : 'INVARIANT_VIOLATION',
      message: passed ? (invariant.message ?? 'Invariant passed.') :
        (invariant.message ?? `Invariant ${invariant.operator} failed at ${invariant.path}.`),
    };
  });
}
