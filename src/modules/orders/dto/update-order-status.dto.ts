import { IsString, IsIn, IsOptional } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['pending', 'processing', 'paid', 'shipped', 'delivered', 'cancelled'])
  status!: string;

  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
