function isNarrowing(oldType, newType) {
  if (!oldType) return false;
  const oldTypes = Array.isArray(oldType) ? oldType : [oldType];
  const newTypes = Array.isArray(newType) ? newType : [newType];
  return oldTypes.some((type) => !newTypes.includes(type));
}

export function compareSchemas(previous, next) {
  const findings = [];
  const oldProperties = previous.properties ?? {};
  const newProperties = next.properties ?? {};
  for (const field of previous.required ?? []) {
    if (!Object.hasOwn(newProperties, field))
      findings.push({
        severity: 'breaking',
        path: `/${field}`,
        code: 'REQUIRED_FIELD_REMOVED',
        message: `Required field "${field}" was removed.`,
      });
  }
  const oldRequired = new Set(previous.required ?? []);
  for (const field of next.required ?? []) {
    if (
      !oldRequired.has(field) &&
      !Object.hasOwn(newProperties[field] ?? {}, 'default')
    )
      findings.push({
        severity: 'breaking',
        path: `/${field}`,
        code: 'NEW_REQUIRED_FIELD',
        message: `Field "${field}" is newly required and has no default.`,
      });
  }
  for (const [field, oldProperty] of Object.entries(oldProperties)) {
    const newProperty = newProperties[field];
    if (!newProperty)
      findings.push({
        severity: 'warning',
        path: `/${field}`,
        code: 'PROPERTY_REMOVED',
        message: `Property "${field}" was removed; consumers may rely on it.`,
      });
    else if (isNarrowing(oldProperty.type, newProperty.type))
      findings.push({
        severity: 'breaking',
        path: `/${field}`,
        code: 'TYPE_NARROWED',
        message: `Property "${field}" changed to a narrower type.`,
      });
  }
  return findings;
}
