// Response envelopes. Success mirrors the error shape: a user-presentable
// message the client never branches on, plus the payload. See API.md.
export type Single<T> = { message: string; data: T };
export type Paginated<T> = {
  message: string;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type HealthDTO = { status: 'ok' };
