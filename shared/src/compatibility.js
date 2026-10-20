const NON_CONSTRAINT_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$anchor',
  '$comment',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  '$defs',
  'definitions',
]);
const ANALYZED_KEYWORDS = new Set([
  ...NON_CONSTRAINT_KEYWORDS,
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
]);

const jsonEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);
const typeSet = (value) =>
  new Set(value === undefined ? [] : Array.isArray(value) ? value : [value]);
const propertyPath = (path, name) =>
  /^[A-Za-z_$][\w$]*$/.test(name)
    ? `${path}.${name}`
    : `${path}[${JSON.stringify(name)}]`;

/**
 * Preliminary structural compatibility analysis. Only explicitly handled
 * keywords are interpreted; changed constraints and composition/ref keywords
 * emit warnings instead of being treated as safe.
 */
export function compareSchemas(previous, next, versions = {}) {
  const findings = [];
  const seen = new Set();
  const add = (code, severity, path, message) => {
    const key = `${code}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      code,
      severity,
      path,
      message,
      oldVersion: versions.oldVersion ?? null,
      newVersion: versions.newVersion ?? null,
    });
  };
  const visit = (oldSchema = {}, newSchema = {}, path = '$') => {
    const oldTypes = typeSet(oldSchema.type);
    const newTypes = typeSet(newSchema.type);
    if (
      newTypes.size &&
      (!oldTypes.size || [...oldTypes].some((type) => !newTypes.has(type)))
    )
      add(
        'INCOMPATIBLE_TYPE_CHANGE',
        'error',
        path,
        `The new schema narrows the accepted type${oldTypes.size === 1 ? '' : 's'} at ${path}.`,
      );

    const oldRequired = new Set(oldSchema.required ?? []);
    const newRequired = new Set(newSchema.required ?? []);
    for (const field of oldRequired) {
      if (!Object.hasOwn(newSchema.properties ?? {}, field))
        add(
          'REMOVED_REQUIRED_PROPERTY',
          'error',
          propertyPath(path, field),
          `The required property ${field} was removed.`,
        );
    }
    for (const field of newRequired) {
      if (!oldRequired.has(field))
        add(
          'NEW_REQUIRED_PROPERTY',
          'error',
          propertyPath(path, field),
          `The new schema requires ${field}, which may be missing from older events.`,
        );
    }
    const oldProperties = oldSchema.properties ?? {};
    const newProperties = newSchema.properties ?? {};
    for (const field of Object.keys(oldProperties)) {
      const child = propertyPath(path, field);
      if (!Object.hasOwn(newProperties, field)) {
        add(
          'REMOVED_PROPERTY',
          'warning',
          child,
          `The property ${field} was removed; existing consumers may rely on it.`,
        );
      } else {
        visit(oldProperties[field], newProperties[field], child);
      }
    }

    if (Array.isArray(oldSchema.enum) && Array.isArray(newSchema.enum)) {
      const removed = oldSchema.enum.filter(
        (value) =>
          !newSchema.enum.some((candidate) => jsonEqual(value, candidate)),
      );
      if (removed.length)
        add(
          'ENUM_VALUES_REMOVED',
          'error',
          path,
          `The new schema removes existing enum value${removed.length === 1 ? '' : 's'}: ${removed.map((item) => JSON.stringify(item)).join(', ')}.`,
        );
    } else if (oldSchema.enum && !newSchema.enum) {
      // Removing an enum constraint accepts more values and is usually a relaxation.
    } else if (!oldSchema.enum && newSchema.enum) {
      add(
        'ENUM_CONSTRAINT_ADDED',
        'warning',
        path,
        `The new schema adds an enum constraint at ${path}; older events may contain other values.`,
      );
    }
    if (
      oldSchema.const !== undefined &&
      newSchema.const !== undefined &&
      !jsonEqual(oldSchema.const, newSchema.const)
    )
      add(
        'CONST_VALUE_CHANGED',
        'error',
        path,
        `The fixed value changed at ${path}.`,
      );
    else if (oldSchema.const === undefined && newSchema.const !== undefined)
      add(
        'CONST_CONSTRAINT_ADDED',
        'warning',
        path,
        `The new schema adds a fixed-value constraint at ${path}.`,
      );

    if (
      oldSchema.items &&
      newSchema.items &&
      typeof oldSchema.items === 'object' &&
      typeof newSchema.items === 'object'
    )
      visit(oldSchema.items, newSchema.items, `${path}[]`);
    else if (
      !jsonEqual(oldSchema.items, newSchema.items) &&
      newSchema.items === false
    )
      add(
        'ARRAY_ITEMS_FORBIDDEN',
        'error',
        `${path}[]`,
        `The new schema forbids array items at ${path}[].`,
      );
    else if (!oldSchema.items && newSchema.items)
      add(
        'ARRAY_ITEM_CONSTRAINT_ADDED',
        'warning',
        `${path}[]`,
        `The new schema constrains array items at ${path}[].`,
      );
    else if (
      oldSchema.items &&
      newSchema.items &&
      !jsonEqual(oldSchema.items, newSchema.items) &&
      (typeof oldSchema.items !== 'object' ||
        typeof newSchema.items !== 'object')
    )
      add(
        'ARRAY_ITEM_CONSTRAINT_CHANGED',
        'warning',
        `${path}[]`,
        `The array item constraint changed at ${path}[] and could not be analyzed safely.`,
      );
    if (oldSchema.items && !newSchema.items) {
      // Removing an item constraint is a relaxation.
    }

    for (const keyword of new Set([
      ...Object.keys(oldSchema),
      ...Object.keys(newSchema),
    ])) {
      if (ANALYZED_KEYWORDS.has(keyword)) continue;
      if (!jsonEqual(oldSchema[keyword], newSchema[keyword]))
        add(
          'UNANALYZED_KEYWORD_CHANGE',
          'warning',
          path,
          `The ${keyword} keyword changed at ${path}; its compatibility impact was not analyzed.`,
        );
    }
  };
  visit(previous, next);
  return findings;
}
