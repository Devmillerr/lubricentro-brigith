import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_POLICY_KEY, type RateLimitPolicy } from './rate-limit.constants';

/** Asigna a una ruta un límite propio en vez del general por método (DEC-86). */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
