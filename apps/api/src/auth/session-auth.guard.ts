import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard global: toda rota exige sessão, exceto as marcadas com `@Public()`.
 *
 * A sessão em si é populada pelo middleware do `express-session`, registrado em
 * `main.ts` antes de qualquer rota — aqui só se confere o que ele já decidiu.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (request.session?.userId) return true;

    throw new UnauthorizedException('Sessão inválida ou expirada. Faça login de novo.');
  }
}
