// Stable API error contract (manual Appendix B).
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_NOT_JOINABLE'
  | 'ALREADY_IN_ROOM'
  | 'NOT_ROOM_MEMBER'
  | 'NOT_HOST'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_COMPLETED'
  | 'NOT_YOUR_TURN'
  | 'INVALID_PHASE'
  | 'INVALID_ACTION'
  | 'INSUFFICIENT_FUNDS'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  correlationId?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const RETRYABLE: ApiErrorCode[] = ['VERSION_CONFLICT', 'RATE_LIMITED', 'INTERNAL'];

export class DomainError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
  get retryable(): boolean {
    return RETRYABLE.includes(this.code);
  }
}

export function fail(code: ApiErrorCode, message: string): never {
  throw new DomainError(code, message);
}
