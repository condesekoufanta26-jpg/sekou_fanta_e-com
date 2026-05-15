import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  shippingAddress!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;
}