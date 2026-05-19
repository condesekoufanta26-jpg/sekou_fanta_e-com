import { IsEmail, IsBoolean, IsOptional } from 'class-validator';

export class SetAdminDto {
  @IsEmail()
  email!: string;

  @IsBoolean()
  @IsOptional()
  isAdmin?: boolean;
}