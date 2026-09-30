import 'dotenv/config';
import { parseEnv } from './config/env.js';

// Parsed before anything listens: a bad environment stops the process here,
// naming the variable, rather than failing on the first request that needs it.
// The database connection and app.listen(env.PORT) follow this line later in M0.
export const env = parseEnv(process.env);
