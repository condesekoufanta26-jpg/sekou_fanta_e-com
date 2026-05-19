// common/services/sms/sms.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SmsService } from './sms.service';

@Module({
  imports: [HttpModule],
  providers: [SmsService],
  exports: [SmsService],  // ← IMPORTANT : exporter SmsService
})
export class SmsModule {}