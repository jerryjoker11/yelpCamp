import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    MONGODB_URI: 'mongodb://localhost:28718/yelpcamp',
};

describe('env config', () => {
    it('accepts a valid environment and returns typed config [M0-AC-05]', () => {
        expect(parseEnv(validEnv)).toEqual({
            NODE_ENV: 'test',
            PORT: 3000,
            MONGODB_URI: 'mongodb://localhost:28718/yelpcamp',
        });
    });
    it('rejects a missing required variable and names it [M0-AC-05]', () => {
        expect(() => parseEnv({ ...validEnv, MONGODB_URI: undefined })).toThrow(/MONGODB_URI:/);
    });
    it('rejects a malformed variable and names it [M0-AC-05]', () => {
        expect(() => parseEnv({ ...validEnv, PORT: 'not-a-port' })).toThrow(/PORT:/);
    });
});
