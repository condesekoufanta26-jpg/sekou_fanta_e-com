import { Injectable, LoggerService as NestLoggerService, Logger } from '@nestjs/common';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: WinstonLogger;

  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp({ format: 'ISO8601' }),
        format.json(),
      ),
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' }),
      ],
    });
  }

  log(message: any, context?: string) {
    this.logger.info(this.formatMessage(message, context));
  }

  error(message: any, trace?: string, context?: string) {
    this.logger.error(this.formatMessage(message, context, trace));
  }

  warn(message: any, context?: string) {
    this.logger.warn(this.formatMessage(message, context));
  }

  debug(message: any, context?: string) {
    this.logger.debug(this.formatMessage(message, context));
  }

  verbose(message: any, context?: string) {
    this.logger.verbose(this.formatMessage(message, context));
  }

  private formatMessage(message: any, context?: string, trace?: string): any {
    if (typeof message === 'object') {
      return { ...message, context, trace };
    }
    return { message, context, trace };
  }
}
