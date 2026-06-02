import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FastifyReply } from 'fastify';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      map(data => ({
        statusCode: response.statusCode,
        message: data?.message || 'Success',
        data: data?.data !== undefined ? data.data : data,
        timestamp: new Date().toISOString(),
        // ✅ AsyncLocalStorage — jamais "unknown"
        correlationId: getCorrelationId() ?? 'no-context',
      })),
    );
  }
}