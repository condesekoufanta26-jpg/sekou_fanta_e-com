import { Module } from '@nestjs/common';
import { CartService } from './Cart.service';
import { CartController } from './Cart.controller';
import { AuthModule } from '../auth/module';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}