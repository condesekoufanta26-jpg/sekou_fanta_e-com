import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  shippingAddress!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;
}
