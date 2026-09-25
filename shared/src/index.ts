// The compile-time contract between the SPA and the API: the ErrorCode union,
// the Single<T>/Paginated<T>/ApiError envelopes, the DTOs, and the Zod request
// schemas. Each lands the first time a test needs it.
export type * from './api.js';
