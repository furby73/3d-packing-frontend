export function limitsOf(schema) {
  const items = schema?.properties?.items ?? {};
  const copies = items.items?.properties?.copies ?? {};
  const runtime = schema?.properties?.maxRuntimeSeconds ?? {};
  return {
    minItems: items.minItems ?? 1,
    maxItems: items.maxItems ?? 50,
    maxTotalCopies: items['x-maxTotalCopies'] ?? 200,
    acceptedFormats: items['x-acceptedFormats'] ?? ['OBJ'],
    minCopies: copies.minimum ?? 1,
    maxCopies: copies.maximum ?? 100,
    defaultCopies: copies.default ?? 1,
    minRuntime: runtime.minimum ?? 1,
    maxRuntime: runtime.maximum ?? 7200,
    defaultRuntime: runtime.default ?? 60,
    runtimeTitle: runtime.title ?? 'Time limit',
    runtimeDescription: runtime.description ?? ''
  };
}

export function fieldsOf(schema) {
  return walk(schema?.properties?.parameters?.properties ?? {}, []);
}

function walk(properties, path) {
  return Object.entries(properties)
    .filter(([, spec]) => !spec.readOnly)
    .map(([key, spec]) => {
      const at = [...path, key];
      const base = { key, path: at, title: spec.title ?? humanize(key), description: spec.description ?? '' };
      if (spec.type === 'object') return { ...base, kind: 'group', children: walk(spec.properties ?? {}, at) };
      if (Array.isArray(spec.enum)) return { ...base, kind: 'enum', options: spec.enum, default: spec.default };
      if (spec.type === 'boolean') return { ...base, kind: 'boolean', default: spec.default ?? false };
      if (spec.type === 'number' || spec.type === 'integer') {
        return {
          ...base,
          kind: 'number',
          integer: spec.type === 'integer',
          minimum: spec.minimum,
          maximum: spec.maximum,
          exclusiveMinimum: spec.exclusiveMinimum,
          exclusiveMaximum: spec.exclusiveMaximum,
          unit: spec['x-unit'],
          default: spec.default
        };
      }
      return { ...base, kind: 'text', default: spec.default ?? '', maxLength: spec.maxLength };
    });
}

function humanize(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

export function defaultsOf(fields) {
  const out = {};
  for (const field of fields) {
    out[field.key] = field.kind === 'group' ? defaultsOf(field.children) : field.default;
  }
  return out;
}

export function mergeParameters(fields, values) {
  const out = {};
  for (const field of fields) {
    const value = values?.[field.key];
    if (field.kind === 'group') out[field.key] = mergeParameters(field.children, value);
    else out[field.key] = value === undefined || value === null ? field.default : value;
  }
  return out;
}

export function parametersOf(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

export function fieldProblem(field, value) {
  if (field.kind === 'number') {
    if (value === '' || value == null || !Number.isFinite(Number(value))) return 'Enter a number';
    const n = Number(value);
    if (field.integer && !Number.isInteger(n)) return 'Enter a whole number';
    if (field.exclusiveMinimum != null && n <= field.exclusiveMinimum) return `Must be more than ${field.exclusiveMinimum}`;
    if (field.minimum != null && n < field.minimum) return `Must be at least ${field.minimum}`;
    if (field.exclusiveMaximum != null && n >= field.exclusiveMaximum) return `Must be less than ${field.exclusiveMaximum}`;
    if (field.maximum != null && n > field.maximum) return `Must be at most ${field.maximum}`;
  }
  if (field.kind === 'enum' && !field.options.includes(value)) return 'Pick one of the options';
  return '';
}

export function problemsOf(fields, values, prefix = '/parameters') {
  const out = {};
  for (const field of fields) {
    const pointer = `${prefix}/${field.key}`;
    if (field.kind === 'group') Object.assign(out, problemsOf(field.children, values?.[field.key], pointer));
    else {
      const problem = fieldProblem(field, values?.[field.key]);
      if (problem) out[pointer] = problem;
    }
  }
  return out;
}

export function rangeHint(field) {
  const low = field.exclusiveMinimum != null ? `> ${field.exclusiveMinimum}` : field.minimum != null ? `${field.minimum}` : null;
  const high = field.maximum != null ? `${field.maximum}` : null;
  if (low && high && field.exclusiveMinimum == null) return `${low}–${high}`;
  if (low && high) return `${low}, ≤ ${high}`;
  if (low) return field.exclusiveMinimum != null ? low : `≥ ${low}`;
  if (high) return `≤ ${high}`;
  return '';
}

export function containerOf(parameters) {
  const box = parametersOf(parameters)?.container;
  if (!box) return null;
  const width = Number(box.width);
  const length = Number(box.length);
  const height = Number(box.height);
  if (![width, length, height].every((side) => Number.isFinite(side) && side > 0)) return null;
  return { width, length, height };
}

export function binStride(parameters) {
  const box = containerOf(parameters);
  if (!box) return null;
  const gap = Number(parametersOf(parameters)?.gap) || 0;
  return box.width + Math.max(gap, box.width * 0.1);
}

export function describeValue(field, value) {
  if (value == null || value === '') return '—';
  if (field?.kind === 'group' && typeof value === 'object') {
    const sides = field.children.map((child) => value[child.key]);
    if (field.children.length === 3 && field.children.every((child) => child.kind === 'number')) return sides.join(' × ');
    return field.children.map((child) => `${child.title}: ${describeValue(child, value[child.key])}`).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
