import type { JsonSchema } from './api/client';

/** A value filled with every default the schema declares, merged over what is given. */
export function withDefaults(schema: JsonSchema, value: unknown): unknown {
	if (schema.type === 'object' && schema.properties) {
		const given = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(schema.properties)) {
			const filled = withDefaults(child, given[key]);
			if (filled !== undefined) out[key] = filled;
		}
		return out;
	}
	return value ?? structuredClone(schema.default);
}

/** Problem with a single number or enum field, or null when it is valid. */
export function fieldError(schema: JsonSchema, value: unknown): string | null {
	if (schema.type === 'number' || schema.type === 'integer') {
		if (typeof value !== 'number' || Number.isNaN(value)) return 'Enter a number.';
		if (schema.type === 'integer' && !Number.isInteger(value)) return 'Enter a whole number.';
		if (schema.minimum !== undefined && value < schema.minimum)
			return `Must be at least ${schema.minimum}.`;
		if (schema.maximum !== undefined && value > schema.maximum)
			return `Must be at most ${schema.maximum}.`;
		if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
			return `Must be more than ${schema.exclusiveMinimum}.`;
		if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum)
			return `Must be less than ${schema.exclusiveMaximum}.`;
	}
	if (schema.enum && !schema.enum.includes(value)) return 'Pick one of the options.';
	return null;
}

/** Every invalid leaf of an object value, as "Title: problem". */
export function objectErrors(schema: JsonSchema, value: unknown, prefix = ''): string[] {
	if (schema.type === 'object' && schema.properties) {
		const given = (value ?? {}) as Record<string, unknown>;
		return Object.entries(schema.properties).flatMap(([key, child]) =>
			objectErrors(child, given[key], child.type === 'object' ? `${child.title ?? key} ` : prefix)
		);
	}
	const error = fieldError(schema, value);
	return error ? [`${prefix}${schema.title ?? ''}: ${error}`.trim()] : [];
}

/** "1 to 7200", "more than 0", "0 or more" for a number field's hint. */
export function rangeHint(schema: JsonSchema): string {
	const unit = schema['x-unit'] ? ` ${schema['x-unit']}` : '';
	if (schema.minimum !== undefined && schema.maximum !== undefined)
		return `${schema.minimum} to ${schema.maximum}${unit}`;
	if (schema.exclusiveMinimum !== undefined) return `More than ${schema.exclusiveMinimum}${unit}`;
	if (schema.minimum !== undefined) return `${schema.minimum} or more${unit}`;
	if (schema.maximum !== undefined) return `Up to ${schema.maximum}${unit}`;
	return '';
}
