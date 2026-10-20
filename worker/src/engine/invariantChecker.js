export function checkInvariants(invariants, payload) {
  return invariants.flatMap((invariant) => {
    const value = invariant.path
      .split('.')
      .reduce((current, key) => current?.[key], payload);
    const valid =
      invariant.operator === 'equals'
        ? value === invariant.value
        : invariant.operator === 'greaterThan'
          ? value > invariant.value
          : value !== undefined;
    return valid
      ? []
      : [
          {
            code: 'INVARIANT_VIOLATION',
            message:
              invariant.message ||
              `Invariant failed at ${invariant.path || 'payload'}.`,
          },
        ];
  });
}
