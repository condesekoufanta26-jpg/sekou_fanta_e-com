import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '';
    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          this.logger.log({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            correlationId,
            method,
            path: url,
            statusCode,
            durationMs: duration,
            ip,
            userAgent,
            userId: (request as any).user?.userId || null,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            correlationId,
            method,
            path: url,
            statusCode: error.status || 500,
            durationMs: duration,
            ip,
            userAgent,
            error: error.message,
          });
        },
      }),
    );
  }
}
