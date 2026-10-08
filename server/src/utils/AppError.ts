import type { ErrorCode } from '@yelpcamp/shared';

// Thrown deliberately for an operational error. Anything else reaching the
// error handler is treated as a bug and gets the generic 500.
export class AppError extends Error {
    readonly code: ErrorCode;
    readonly status: number;

    constructor(code: ErrorCode, status: number, message: string) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.status = status;
    }
}
