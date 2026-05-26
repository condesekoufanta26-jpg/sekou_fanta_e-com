import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logging.service';

@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggingModule {}
