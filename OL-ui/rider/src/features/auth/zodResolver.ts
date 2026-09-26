import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Minimal zod → react-hook-form resolver (the project does not ship @hookform/resolvers).
 * Returns the schema's transformed output as the submitted values.
 */
export const zodResolver =
  <TSchema extends z.ZodType>(schema: TSchema): Resolver<z.input<TSchema> & FieldValues, unknown, z.output<TSchema>> =>
  async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map((p) => String(p)).join('.') || 'root';
      if (!errors[path]) errors[path] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<z.input<TSchema> & FieldValues> };
  };
