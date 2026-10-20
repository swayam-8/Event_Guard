const NON_CONSTRAINT_KEYWORDS = new Set([
  '$schema', '$id', '$anchor', '$comment', 'title', 'description', 'examples',
  'default', 'deprecated', 'readOnly', 'writeOnly', '$defs', 'definitions',
]);
const ANALYZED_KEYWORDS = new Set([
  ...NON_CONSTRAINT_KEYWORDS, 'type', 'properties', 'required', 'items', 'enum',
  'const', 'additionalProperties',
]);
const UNSUPPORTED_KEYWORDS = new Set([
  '$ref', '$dynamicRef', '$recursiveRef', 'allOf', 'anyOf', 'oneOf', 'not',
  'if', 'then', 'else', 'patternProperties', 'propertyNames', 'contains',
  'prefixItems', 'unevaluatedProperties', 'unevaluatedItems',
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const jsonEqual = (left, right) => canonical(left) === canonical(right);
const typeSet = (value) => new Set(value === undefined ? [] : Array.isArray(value) ? value : [value]);
const propertyPath = (path, name) => /^[A-Za-z_$][\w$]*$/.test(name)
  ? `${path}.${name}` : `${path}[${JSON.stringify(name)}]`;
const objectSchema = (schema) => schema && typeof schema === 'object' && !Array.isArray(schema);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

/**
 * Conservative direction: every instance valid under the old schema should
 * remain valid under the new schema. Consumer behavior is analyzed separately.
 * compatible is true only when no risks remain; analysisComplete is false if
 * a construct or constraint was not fully understood.
 */
export function analyzeCompatibility(previous, next, versions = {}) {
  const findings = [];
  const seen = new Set();
  let analysisComplete = true;
  const add = (code, severity, path, message) => {
    const key = `${code}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (severity === 'warning') analysisComplete = false;
    findings.push({ code, severity, path, message,
      oldVersion: versions.oldVersion ?? null,
      newVersion: versions.newVersion ?? null });
  };

  const visit = (oldSchema, newSchema, path = '$') => {
    if (oldSchema === false || newSchema === true) return;
    if (oldSchema === true && newSchema === false) {
      add('SCHEMA_FORBIDS_VALUES', 'error', path,
        `The new schema rejects all values previously accepted at ${path}.`);
      return;
    }
    if (newSchema === false) {
      add('SCHEMA_FORBIDS_VALUES', 'error', path,
        `The new schema rejects all values previously accepted at ${path}.`);
      return;
    }
    if (oldSchema === true && objectSchema(newSchema)) {
      add('SCHEMA_CONSTRAINT_ADDED', 'error', path,
        `The new schema adds constraints to previously unconstrained values at ${path}.`);
      return;
    }
    if (!objectSchema(oldSchema) || !objectSchema(newSchema)) {
      if (!jsonEqual(oldSchema, newSchema))
        add('UNANALYZED_SCHEMA_CHANGE', 'warning', path,
          `A schema form changed at ${path}; compatibility could not be proven.`);
      return;
    }

    for (const keyword of UNSUPPORTED_KEYWORDS) {
      if (Object.hasOwn(oldSchema, keyword) || Object.hasOwn(newSchema, keyword))
        add('UNSUPPORTED_SCHEMA_CONSTRUCT', 'warning', path,
          `The ${keyword} construct at ${path} is not fully analyzed; compatibility is unknown.`);
    }

    const oldTypes = typeSet(oldSchema.type);
    const newTypes = typeSet(newSchema.type);
    if (oldTypes.size && newTypes.size && [...oldTypes].some((type) => !newTypes.has(type)))
      add('INCOMPATIBLE_TYPE_CHANGE', 'error', path,
        `The new schema rejects one or more types accepted by the old schema at ${path}.`);
    else if (!oldTypes.size && newTypes.size)
      add('INCOMPATIBLE_TYPE_CHANGE', 'error', path,
        `The new schema restricts previously unconstrained types at ${path}.`);

    const oldRequired = new Set(oldSchema.required ?? []);
    const newRequired = new Set(newSchema.required ?? []);
    for (const field of [...newRequired].sort()) {
      if (!oldRequired.has(field))
        add('NEW_REQUIRED_PROPERTY', 'error', propertyPath(path, field),
          `The new schema requires ${field}, which may be missing from older events.`);
    }

    const oldProperties = oldSchema.properties ?? {};
    const newProperties = newSchema.properties ?? {};
    for (const field of Object.keys(oldProperties).sort()) {
      const child = propertyPath(path, field);
      if (!Object.hasOwn(newProperties, field)) {
        add('REMOVED_PROPERTY', 'info', child,
          `The property ${field} is no longer declared. Old events remain schema-valid unless the new schema rejects additional properties, but consumers may rely on the field.`);
        if (newSchema.additionalProperties === false)
          add('REMOVED_PROPERTY_REJECTED', 'error', child,
            `The new schema rejects the previously declared property ${field}.`);
      } else visit(oldProperties[field], newProperties[field], child);
    }

    if (Array.isArray(oldSchema.enum) && Array.isArray(newSchema.enum)) {
      const removed = oldSchema.enum.filter((value) => !newSchema.enum.some((candidate) => jsonEqual(value, candidate)));
      if (removed.length)
        add('ENUM_VALUES_REMOVED', 'error', path,
          `The new schema removes existing enum value${removed.length === 1 ? '' : 's'}: ${removed.map((item) => canonical(item)).join(', ')}.`);
    } else if (!oldSchema.enum && newSchema.enum) {
      add('ENUM_CONSTRAINT_ADDED', 'error', path,
        `The new schema restricts previously unconstrained values with an enum at ${path}.`);
    } else if (oldSchema.enum && newSchema.enum && !Array.isArray(oldSchema.enum)) {
      add('UNANALYZED_ENUM', 'warning', path, `The enum at ${path} could not be analyzed safely.`);
    }

    if (Object.hasOwn(oldSchema, 'const') && Object.hasOwn(newSchema, 'const') && !jsonEqual(oldSchema.const, newSchema.const))
      add('CONST_VALUE_CHANGED', 'error', path, `The fixed value changed at ${path}.`);
    else if (!Object.hasOwn(oldSchema, 'const') && Object.hasOwn(newSchema, 'const'))
      add('CONST_CONSTRAINT_ADDED', 'warning', path, `The new schema adds a fixed-value constraint at ${path}.`);

    const oldAdditional = oldSchema.additionalProperties;
    const newAdditional = newSchema.additionalProperties;
    if (newAdditional === false && oldAdditional !== false) {
      add('ADDITIONAL_PROPERTIES_RESTRICTED', 'error', path,
        `The new schema rejects additional properties that the old schema could accept at ${path}.`);
    } else if (objectSchema(oldAdditional) && objectSchema(newAdditional)) {
      visit(oldAdditional, newAdditional, `${path}.*`);
    } else if (!jsonEqual(oldAdditional, newAdditional) && newAdditional !== true) {
      add('ADDITIONAL_PROPERTIES_CHANGED', 'warning', path,
        `The additionalProperties rule changed at ${path}; impact could not be fully analyzed.`);
    }

    const oldItems = oldSchema.items;
    const newItems = newSchema.items;
    if (objectSchema(oldItems) && objectSchema(newItems)) visit(oldItems, newItems, `${path}[]`);
    else if (oldItems !== undefined && newItems === false)
      add('ARRAY_ITEMS_FORBIDDEN', 'error', `${path}[]`, `The new schema forbids items that the old schema could accept at ${path}[].`);
    else if (oldItems === undefined && newItems !== undefined && newItems !== true)
      add('ARRAY_ITEM_CONSTRAINT_ADDED', 'warning', `${path}[]`, `The new schema constrains array items at ${path}[]; compatibility is not proven.`);
    else if (!jsonEqual(oldItems, newItems) && newItems !== undefined && newItems !== true)
      add('ARRAY_ITEM_CONSTRAINT_CHANGED', 'warning', `${path}[]`, `The array item rule changed at ${path}[] and could not be analyzed safely.`);

    const keywords = new Set([...Object.keys(oldSchema), ...Object.keys(newSchema)]);
    for (const keyword of [...keywords].sort()) {
      if (ANALYZED_KEYWORDS.has(keyword) || UNSUPPORTED_KEYWORDS.has(keyword)) continue;
      if (!jsonEqual(oldSchema[keyword], newSchema[keyword]))
        add('UNANALYZED_KEYWORD_CHANGE', 'warning', path,
          `The ${keyword} keyword changed at ${path}; its compatibility impact was not analyzed.`);
    }
  };

  visit(previous, next);
  findings.sort((a, b) => compareText(a.path, b.path) || compareText(a.code, b.code) || compareText(a.severity, b.severity));
  return {
    direction: 'old-valid-to-new-valid',
    compatible: !findings.some((finding) => finding.severity === 'error' || finding.severity === 'warning'),
    analysisComplete,
    findings,
  };
}

// Keep the Phase 2 API contract stable for existing callers.
export function compareSchemas(previous, next, versions = {}) {
  return analyzeCompatibility(previous, next, versions).findings;
}
