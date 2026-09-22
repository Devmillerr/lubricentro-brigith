import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class MeUserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;
}

export class MeBusinessResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

/** `GET /auth/me`: solo campos públicos del usuario (nunca `passwordHash`). */
export class MeResponse {
  @ApiProperty({ type: MeUserResponse })
  user!: MeUserResponse;

  @ApiProperty({ type: MeBusinessResponse })
  business!: MeBusinessResponse;
}
