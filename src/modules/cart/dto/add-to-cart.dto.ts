import { IsInt, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  productId!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}
