import { IsString, IsIn, IsOptional } from 'class-validator';

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
