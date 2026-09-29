import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './change-password.dto';

export class RecoverPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: 'ABCD-EFGH-JKLM' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recoveryCode!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `La contraseña nueva puede tener hasta ${PASSWORD_MAX_LENGTH} caracteres.`,
  })
  newPassword!: string;
}

export class RecoverPasswordResponse {
  @ApiProperty({
    description: 'Código de recuperación nuevo (el usado ya no sirve). Se muestra una sola vez.',
  })
  recoveryCode!: string;
}
