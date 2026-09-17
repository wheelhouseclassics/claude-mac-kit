'use strict';
// Minimal JSON-Schema (draft-07 subset) validator — no npm dependencies.
// Supports: type, const, enum, required, properties, additionalProperties, items, minItems, maxItems,
// minLength, pattern, minimum, maximum, uniqueItems, $ref (local "#/definitions/..." only).

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error('only local $ref supported: ' + ref);
  return ref.slice(2).split('/').reduce((o, k) => (o == null ? undefined : o[k]), root);
}

function typeOf(d) {
  if (d === null) return 'null';
  if (Array.isArray(d)) return 'array';
  return typeof d;
}

function check(schema, data, where, errs, root) {
  if (schema.$ref) schema = resolveRef(root, schema.$ref);
  if (!schema) { errs.push(`${where}: unresolvable schema`); return; }
  if (schema.const !== undefined && JSON.stringify(data) !== JSON.stringify(schema.const)) {
    errs.push(`${where}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data))) {
    errs.push(`${where}: ${JSON.stringify(data)} not in enum [${schema.enum.join(', ')}]`);
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    const t = typeOf(data);
    const ok = types.some((x) => x === t || (x === 'integer' && t === 'number' && Number.isInteger(data)));
    if (!ok) { errs.push(`${where}: expected ${types.join('|')}, got ${t}`); return; }
  }
  if (typeof data === 'string') {
    if (schema.minLength != null && data.length < schema.minLength) errs.push(`${where}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errs.push(`${where}: ${JSON.stringify(data)} does not match /${schema.pattern}/`);
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) errs.push(`${where}: below minimum ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errs.push(`${where}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) errs.push(`${where}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && data.length > schema.maxItems) errs.push(`${where}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems) {
      const seen = new Set();
      data.forEach((x, i) => { const k = JSON.stringify(x); if (seen.has(k)) errs.push(`${where}[${i}]: duplicate item`); seen.add(k); });
    }
    if (schema.items) data.forEach((x, i) => check(schema.items, x, `${where}[${i}]`, errs, root));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of schema.required || []) if (!(k in data)) errs.push(`${where}: missing required "${k}"`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (props[k]) check(props[k], v, `${where}.${k}`, errs, root);
      else if (schema.additionalProperties === false) errs.push(`${where}: unexpected property "${k}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') check(schema.additionalProperties, v, `${where}.${k}`, errs, root);
    }
  }
}

function validate(schema, data) {
  const errs = [];
  check(schema, data, '$', errs, schema);
  return errs;
}

module.exports = { validate };
