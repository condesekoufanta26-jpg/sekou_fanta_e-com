import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
// ✅ IMPORT FASTIFY
import { FastifyReply, FastifyRequest } from 'fastify';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    // ✅ FastifyReply (pas Express Response)
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    
    // ✅ Récupérer correlationId via la fonction utilitaire
    const correlationId = getCorrelationId() || (request.headers['x-correlation-id'] as string) || 'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        message = resp.message || message;
        error = resp.error || error;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack);
      message = process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message;
    }

    // ✅ CORRECTION CRITIQUE: .code() au lieu de .status() pour Fastify
    const errorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      correlationId,
      path: request.url,
      method: request.method,
    };

    // ✅ Fastify: reply.code(status).header(key, value).send(body)
    reply
      .code(statusCode)
      .header('X-Correlation-Id', correlationId)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send(errorResponse);
  }
}