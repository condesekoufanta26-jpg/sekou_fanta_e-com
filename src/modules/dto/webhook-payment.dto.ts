import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class WebhookPaymentDto {
  @IsString()
  eventType!: string;

  @IsString()
  transactionId!: string;

  @IsString()
  @IsIn(['succeeded', 'failed', 'pending'])
  status!: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  errorMessage?: string;
}