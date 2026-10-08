import 'dotenv/config';
import mongoose from 'mongoose';
import { buildApp } from './app.js';
import { parseEnv } from './config/env.js';

// Parsed before anything listens: a bad environment stops the process here,
// naming the variable, rather than failing on the first request that needs it.
export const env = parseEnv(process.env);

const app = buildApp({
    isDbReady: () => mongoose.connection.readyState === mongoose.ConnectionStates.connected,
});

// Listen first, then connect: a down database yields 503 from /api/health
// (M0-AC-02) rather than a dead process. The URI is never logged because it
// holds a password.
app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
});

mongoose.connect(env.MONGODB_URI).catch((error: unknown) => {
    const reason = error instanceof Error ? error.name : 'unknown error';
    console.error(`Initial database connection failed (${reason}).`);
});
