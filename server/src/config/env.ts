import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive(),
    MONGODB_URI: z
        .string()
        .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Takes its source as an argument so tests pass a plain object; only the entry
// point hands it process.env. Names each failing variable, never its value,
// because the value may be a secret.
export const parseEnv = (source: Record<string, string | undefined>): EnvConfig => {
    const result = envSchema.safeParse(source);
    if (!result.success) {
        const problems = result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
        );
        throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
    }
    return result.data;
};
