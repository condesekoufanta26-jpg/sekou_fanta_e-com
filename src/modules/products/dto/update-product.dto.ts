import { IsString, IsNumber, IsOptional, IsBoolean, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
