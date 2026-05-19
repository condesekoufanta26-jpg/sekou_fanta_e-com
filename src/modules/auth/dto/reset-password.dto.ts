// src/modules/auth/dto/reset-password.dto.ts
import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewSecurePass123!', description: 'New password (min 8 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(64)
  newPassword!: string;

  @ApiProperty({ example: 'NewSecurePass123!', description: 'Confirm new password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(64)
  confirmPassword!: string;
}