import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto, ChangePasswordResponse } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RecoverPasswordDto, RecoverPasswordResponse } from './dto/recover-password.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AccessTokenPayload } from './types/jwt-payload';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { MeResponse } from './dto/me.response';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOkResponse({ type: TokenPairDto })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: ['INVALID_CREDENTIALS'] })
  // 5/min por IP y 5/min por `username`, sin bloqueo de cuentas (DEC-86).
  @RateLimit('login')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.authService.login(dto.username, dto.password);
  }

  @ApiOkResponse({ type: TokenPairDto })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: ['INVALID_REFRESH_TOKEN'] })
  // 20/min por IP (DEC-86).
  @RateLimit('refresh')
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

  @ApiOkResponse({ type: ChangePasswordResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: AUTH_ERRORS })
  // Mismo límite que el login (5/min por IP): frena el adivinar la contraseña actual.
  @RateLimit('login')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    return this.authService.changePassword(
      user.businessId,
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @ApiOkResponse({ type: RecoverPasswordResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 401: ['INVALID_RECOVERY_CODE'] })
  // Comparte los contadores del login (5/min por IP y 5/min por `username`, DEC-86).
  @RateLimit('login')
  @Post('recover')
  @HttpCode(HttpStatus.OK)
  async recover(@Body() dto: RecoverPasswordDto): Promise<RecoverPasswordResponse> {
    return this.authService.recoverPassword(dto.username, dto.recoveryCode, dto.newPassword);
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
