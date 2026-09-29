import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Business, User } from '@prisma/client';
import type { Env } from '../config/env.validation';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import { generateRecoveryCode, normalizeRecoveryCode } from './recovery-code.util';
import { hashRefreshTokenValue } from './refresh-token.util';
import type { AccessTokenPayload } from './types/jwt-payload';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Hash de una contraseña arbitraria, para que `login` tarde lo mismo exista o
// no exista el `username` y no delate por tiempo qué usuarios existen.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$Z4hL6F9sBo9EbqChXb3w9w$G6/FroqWg8mDcJeRpch03m8cji8K0kjvCbbPWxC+ZTY';

function invalidCredentials(): ProblemException {
  return new ProblemException({
    status: HttpStatus.UNAUTHORIZED,
    code: 'INVALID_CREDENTIALS',
    title: 'Usuario o contraseña incorrectos',
  });
}

function invalidRecoveryCode(): ProblemException {
  return new ProblemException({
    status: HttpStatus.UNAUTHORIZED,
    code: 'INVALID_RECOVERY_CODE',
    title: 'Usuario o código de recuperación incorrectos',
  });
}

function hashSecret(value: string): Promise<string> {
  return argon2.hash(value, { type: argon2.argon2id });
}

function invalidRefreshToken(): ProblemException {
  return new ProblemException({
    status: HttpStatus.UNAUTHORIZED,
    code: 'INVALID_REFRESH_TOKEN',
    title: 'El token de refresco no es válido o expiró',
  });
}

/**
 * Login, refresco y logout (04-ARCHITECTURE.md §6, DEC-11, DEC-25).
 *
 * `username` es único globalmente (DEC-25), así que `login` y `refresh`
 * buscan sin conocer el `businessId` todavía: por eso usan `PrismaService`
 * directo en vez de `forBusiness`. Es la única excepción a esa regla
 * (ver el comentario sobre `User.username` en `prisma/schema.prisma`) y solo
 * aplica a estas dos búsquedas por clave única global (`username`,
 * `tokenHash`). El resto de operaciones ya conoce el `businessId` y sí pasa
 * por `forBusiness`.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(username: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      throw invalidCredentials();
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return this.issueTokenPair(user);
  }

  async refresh(refreshTokenValue: string): Promise<TokenPair> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(refreshTokenValue, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw invalidRefreshToken();
    }

    const tokenHash = hashRefreshTokenValue(refreshTokenValue);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (
      !existing ||
      existing.userId !== payload.sub ||
      existing.businessId !== payload.businessId
    ) {
      throw invalidRefreshToken();
    }

    const scoped = forBusiness(this.prisma, existing.businessId);

    if (existing.revokedAt) {
      // Un token ya rotado (o cerrado por logout) vuelve a usarse: puede ser
      // un robo de token. Por precaución, se cierra toda la sesión del usuario.
      await scoped.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalidRefreshToken();
    }

    const user = await scoped.user.findFirst({ where: { id: payload.sub, isActive: true } });
    if (!user) {
      throw invalidRefreshToken();
    }

    const pair = await this.issueTokenPair(user);

    await scoped.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: hashRefreshTokenValue(pair.refreshToken),
      },
    });

    return pair;
  }

  async logout(businessId: string, userId: string, refreshTokenValue: string): Promise<void> {
    const tokenHash = hashRefreshTokenValue(refreshTokenValue);
    await forBusiness(this.prisma, businessId).refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cambia la contraseña del mismo usuario (no crea otro ni toca su negocio).
   * Genera un código de recuperación nuevo (se muestra una sola vez), cierra
   * todas las sesiones abiertas y devuelve un par nuevo para seguir en esta.
   * Contraseña actual incorrecta → 400 con error en `currentPassword` (no 401:
   * la web interpreta un 401 como sesión vencida).
   */
  async changePassword(
    businessId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<TokenPair & { recoveryCode: string }> {
    const scoped = forBusiness(this.prisma, businessId);
    const user = await scoped.user.findFirst({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const currentMatches = await argon2
      .verify(user.passwordHash, currentPassword)
      .catch(() => false);
    if (!currentMatches) {
      throw new ValidationProblemException([
        { field: 'currentPassword', message: 'La contraseña actual no es correcta.' },
      ]);
    }

    const recoveryCode = generateRecoveryCode();
    const updated = await this.setPassword(businessId, user.id, newPassword, recoveryCode);
    const pair = await this.issueTokenPair(updated);
    return { ...pair, recoveryCode };
  }

  /**
   * Recuperación con el código de un solo uso (sin correo ni registro). Mismo
   * error si el usuario no existe, está inactivo, no tiene código o el código
   * no coincide, y mismo tiempo de respuesta, para no delatar usuarios.
   * El código usado deja de servir: se devuelve uno nuevo.
   */
  async recoverPassword(
    username: string,
    recoveryCode: string,
    newPassword: string,
  ): Promise<{ recoveryCode: string }> {
    // Búsqueda por clave única global, como en `login` (ver el comentario de la clase).
    const user = await this.prisma.user.findUnique({ where: { username } });
    const normalized = normalizeRecoveryCode(recoveryCode);

    if (!user || !user.isActive || !user.recoveryCodeHash) {
      await argon2.verify(DUMMY_HASH, normalized).catch(() => false);
      throw invalidRecoveryCode();
    }

    const codeMatches = await argon2.verify(user.recoveryCodeHash, normalized).catch(() => false);
    if (!codeMatches) {
      throw invalidRecoveryCode();
    }

    const nextCode = generateRecoveryCode();
    await this.setPassword(user.businessId, user.id, newPassword, nextCode);
    return { recoveryCode: nextCode };
  }

  async me(businessId: string, userId: string): Promise<{ user: User; business: Business }> {
    const [user, business] = await Promise.all([
      forBusiness(this.prisma, businessId).user.findFirst({ where: { id: userId } }),
      this.prisma.business.findUnique({ where: { id: businessId } }),
    ]);

    if (!user || !business) {
      throw new UnauthorizedException();
    }

    return { user, business };
  }

  /** Guarda la contraseña y el código nuevos (con hash) y cierra todas las sesiones del usuario. */
  private async setPassword(
    businessId: string,
    userId: string,
    newPassword: string,
    recoveryCode: string,
  ): Promise<User> {
    const scoped = forBusiness(this.prisma, businessId);
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hashSecret(newPassword),
      hashSecret(normalizeRecoveryCode(recoveryCode)),
    ]);
    const updated = await scoped.user.update({
      where: { id: userId },
      data: { passwordHash, recoveryCodeHash },
    });
    await scoped.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return updated;
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      // `env.validation.ts` ya exige el formato "15m"/"1h"; jsonwebtoken solo
      // tipa `expiresIn` como el literal de plantilla de la librería `ms`, no
      // como `string` genérico.
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }) as JwtSignOptions['expiresIn'],
    });

    const refreshToken = await this.jwtService.signAsync(
      // `jti` evita que dos tokens emitidos en el mismo segundo (mismos
      // `sub`/`businessId`/`role`/`iat`/`exp`) firmen al byte el mismo JWT,
      // lo que rompería la unicidad de `tokenHash`.
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', {
          infer: true,
        }) as JwtSignOptions['expiresIn'],
      },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);

    await forBusiness(this.prisma, user.businessId).refreshToken.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        tokenHash: hashRefreshTokenValue(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
