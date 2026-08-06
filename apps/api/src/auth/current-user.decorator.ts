import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

/**
 * O dono da requisição, tirado da sessão e já como `ObjectId`.
 *
 * Toda rota que fala com o banco recebe isto e o repassa ao serviço. É de
 * propósito que seja um parâmetro explícito, e não um estado ambiente que os
 * serviços consultassem sozinhos: com o dono na assinatura, o compilador cobra
 * quem esquecer — e "esquecer o dono" aqui significa uma consulta que devolve as
 * compras de todo mundo.
 *
 * O `SessionAuthGuard` já barrou a requisição sem sessão antes de chegar aqui; a
 * exceção abaixo cobre o caso de alguém usar o decorator numa rota `@Public()`,
 * que é erro de programação e não deve virar `undefined` silencioso.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Types.ObjectId => {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;
    if (!userId) throw new UnauthorizedException('Sessão inválida ou expirada.');
    return new Types.ObjectId(userId);
  },
);
