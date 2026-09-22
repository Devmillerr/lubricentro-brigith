import type { AccessTokenPayload } from './jwt-payload';

declare global {
  namespace Express {
    interface Request {
      authUser?: AccessTokenPayload;
    }
  }
}

export {};
