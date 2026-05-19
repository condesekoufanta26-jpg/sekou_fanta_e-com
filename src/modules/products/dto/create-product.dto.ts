import { IsString, IsNumber, IsOptional, Min, MaxLength, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock!: number;
}
