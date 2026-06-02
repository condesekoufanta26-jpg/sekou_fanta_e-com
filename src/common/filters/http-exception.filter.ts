import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const status = exception.getStatus();
    const correlationId = (request.headers['x-correlation-id'] as string) || 'unknown';

    this.logger.error({
      timestamp: new Date().toISOString(),
      correlationId,
      statusCode: status,
      path: request.url,
      error: exception.message,
    });

    // ✅ Correction : .send() au lieu de .json()
    response.status(status).send({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      message: exception.message,
    });
  }
}