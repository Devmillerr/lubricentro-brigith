import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AccessTokenPayload } from './types/jwt-payload';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { MeResponse } from './dto/me.response';

/**
 * Límite propio de `/auth/login`, más estricto que el global (20/min por IP y
 * por endpoint, app.module.ts): 5 intentos por minuto por IP. En memoria, sin
 * bloqueo de cuentas (DEC-10 sin `trust proxy` todavía).
 */
export const LOGIN_THROTTLE = { ttl: 60_000, limit: 5 };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOkResponse({ type: TokenPairDto })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: ['INVALID_CREDENTIALS'] })
  @Throttle({ default: LOGIN_THROTTLE })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.authService.login(dto.username, dto.password);
  }

  @ApiOkResponse({ type: TokenPairDto })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: ['INVALID_REFRESH_TOKEN'] })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiNoContentResponse()
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: AUTH_ERRORS })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AccessTokenPayload, @Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(user.businessId, user.sub, dto.refreshToken);
  }

  @ApiOkResponse({ type: MeResponse })
  @ApiErrors({ 401: AUTH_ERRORS })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: AccessTokenPayload): Promise<MeResponse> {
    const { user: currentUser, business } = await this.authService.me(user.businessId, user.sub);
    return {
      user: {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        role: currentUser.role,
      },
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
      },
    };
  }
}
