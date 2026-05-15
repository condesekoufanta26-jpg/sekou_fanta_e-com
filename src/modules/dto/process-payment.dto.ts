import { IsString, IsIn, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPaymentDto {
  @IsString()
  @IsIn(['card', 'paypal', 'stripe'])
  paymentMethod!: string;

  @IsString()
  @IsOptional()
  cardNumber?: string;

  @IsString()
  @IsOptional()
  cardExpiry?: string;

  @IsString()
  @IsOptional()
  cardCvc?: string;
}