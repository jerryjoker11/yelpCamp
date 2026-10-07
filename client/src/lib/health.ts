import type { ApiError, HealthDTO, Single } from '@yelpcamp/shared';

export type ApiStatus = 'checking' | 'available' | 'unavailable';

// Relative path on purpose: production reaches the API through a same-origin
// rewrite, so an absolute URL would become a cross-origin request (M0-AC-07).
export const fetchApiStatus = async (signal: AbortSignal): Promise<ApiStatus> => {
  try {
    const response = await fetch('/api/health', { signal });
    const body = (await response.json()) as Single<HealthDTO> | ApiError;
    return response.ok && 'data' in body && body.data.status === 'ok' ? 'available' : 'unavailable';
  } catch (error) {
    if (signal.aborted) throw error;
    return 'unavailable';
  }
};
