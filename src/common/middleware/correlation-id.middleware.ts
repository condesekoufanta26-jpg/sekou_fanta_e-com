import { Injectable } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

export const als = new AsyncLocalStorage<Map<string, any>>();

export function getCorrelationId(): string | undefined {
  return als.getStore()?.get('correlationId');
}

/**
 * ✅ Hook Fastify avec callback done() — PAS async
 * done() appelé DANS als.run() pour que le contexte reste actif
 * pendant toute la durée du traitement de la requête
 */
export function correlationIdHook(
  req: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || uuidv4();

  reply.header('X-Correlation-Id', correlationId);
  (req as any).correlationId = correlationId;

  const store = new Map<string, any>();
  store.set('correlationId', correlationId);
  store.set('startTime', Date.now());

  // ✅ done() à l'intérieur de als.run() — contexte propagé à toute la chaîne
  als.run(store, () => {
    done();
  });
}

@Injectable()
export class CorrelationIdMiddleware {
  use(req: FastifyRequest, reply: FastifyReply, next: () => void) {
    correlationIdHook(req, reply, next);
  }
}