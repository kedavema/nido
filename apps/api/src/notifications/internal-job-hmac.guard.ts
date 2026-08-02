import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CLOCK, type Clock } from '../common/clock.js';
import type { Environment } from '../config/environment.js';
import {
  INTERNAL_JOB_NONCES_REPOSITORY,
  type InternalJobNoncesRepository,
} from './internal-job-nonces.repository.js';

export const TIMESTAMP_HEADER = 'x-nido-timestamp';
export const NONCE_HEADER = 'x-nido-nonce';
export const SIGNATURE_HEADER = 'x-nido-signature';

/** How far the caller's clock may drift from ours before the signature is refused. */
export const CLOCK_SKEW_SECONDS = 300;

const SIGNATURE_PREFIX = 'v1=';
const UNAUTHORIZED = 'Job authentication is invalid';

interface RawBodyRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly rawBody?: Buffer;
}

/**
 * Authenticates the scheduler for `/v1/internal/jobs/*` (docs/system-design.md §12). No Firebase
 * token: the caller is GitHub Actions, not a user, and giving a cron a user identity would mean
 * issuing a credential nobody can rotate independently.
 */
@Injectable()
export class InternalJobHmacGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    @Inject(INTERNAL_JOB_NONCES_REPOSITORY)
    private readonly nonces: InternalJobNoncesRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get('NOTIFICATIONS_JOB_HMAC_SECRET', { infer: true });
    if (secret === undefined || secret.length === 0) {
      // Unconfigured closes the endpoint rather than opening it: an unauthenticated job route is
      // worse than a job that does not run.
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const timestamp = singleHeader(request.headers[TIMESTAMP_HEADER]);
    const nonce = singleHeader(request.headers[NONCE_HEADER]);
    const signature = singleHeader(request.headers[SIGNATURE_HEADER]);
    if (timestamp === null || nonce === null || signature === null) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const now = this.clock.now();
    if (!isWithinClockSkew(timestamp, now)) {
      // Bounding the window is what makes remembering nonces for ten minutes sufficient; without
      // it a captured request could be replayed years later against a table that forgot it.
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    // Sign the bytes that actually arrived. Signing a parsed-and-reserialized body would let key
    // order or whitespace changes slip past the signature.
    const expected = signJobRequest(secret, timestamp, nonce, request.rawBody ?? Buffer.alloc(0));
    if (!isSignatureEqual(expected, signature)) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    if (!(await this.nonces.remember(nonce, now))) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    // Pruning here rather than on a timer keeps the table bounded without another moving part;
    // it only runs on requests that already authenticated.
    await this.nonces.prune(now);

    return true;
  }
}

/** The canonical signature both the caller and this guard compute. */
export function signJobRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: Buffer,
): string {
  const bodyDigest = createHash('sha256').update(body).digest('hex');
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret)
    .update(`v1:${timestamp}:${nonce}:${bodyDigest}`)
    .digest('hex')}`;
}

function isWithinClockSkew(timestamp: string, now: Date): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    return false;
  }
  // Symmetric: a timestamp far in the future is as suspicious as one far in the past.
  return Math.abs(Math.floor(now.getTime() / 1000) - seconds) <= CLOCK_SKEW_SECONDS;
}

function isSignatureEqual(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  // timingSafeEqual throws on a length mismatch, so the lengths are compared first — a length
  // difference is not secret, the byte values are.
  return (
    expectedBytes.byteLength === providedBytes.byteLength &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  // A repeated header is ambiguous about which value was signed, so it is refused rather than
  // resolved by picking one.
  return null;
}
