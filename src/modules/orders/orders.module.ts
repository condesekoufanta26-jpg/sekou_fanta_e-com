import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
  imports: [
    DatabaseModule, // ✅ fournit DATABASE_POOL
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}