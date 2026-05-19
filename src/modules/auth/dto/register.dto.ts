// src/modules/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '+33612345678', required: false, description: 'Phone number for SMS' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}