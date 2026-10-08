// The ErrorCode catalogue. A runtime array so the union is derived from it and
// the server can check a code at runtime. Adding a code means adding it to the
// catalogue in ERROR_HANDLING.md too; renaming one is a breaking API change.
export const ERROR_CODES = [
    'VALIDATION_FAILED',
    'MALFORMED_JSON',
    'PAYLOAD_TOO_LARGE',
    'UNAUTHENTICATED',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'INVALID_CREDENTIALS',
    'NOT_OWNER',
    'CAMPGROUND_NOT_FOUND',
    'REVIEW_NOT_FOUND',
    'USER_NOT_FOUND',
    'ROUTE_NOT_FOUND',
    'EMAIL_TAKEN',
    'ACCOUNT_LINK_REFUSED',
    'UNSUPPORTED_MEDIA_TYPE',
    'IMAGE_NOT_UPLOADED',
    'LINK_INVALID',
    'RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
    'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
