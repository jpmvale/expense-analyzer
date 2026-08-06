import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

/**
 * Deixa passar só a conta dona da instância.
 *
 * Existe por causa do Google Drive, e não por hierarquia: as faturas vêm de uma
 * conta Google com OAuth configurado à mão — `drive-credentials.json` e
 * `token.json` no servidor —, e isso é de uma pessoa só. Pedir o mesmo a cada
 * usuário significaria tela de consentimento, token por conta e refresh, e essa
 * não é a promessa desta versão: quem não é dono importa CSV por `POST /import`,
 * que faz a mesma ingestão pelo mesmo pipeline.
 *
 * Roda depois do `SessionAuthGuard` — quem chega aqui já tem sessão válida.
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;
    const user = userId ? await this.authService.findById(userId) : null;

    if (!user || !this.authService.isOwner(user.username)) {
      throw new ForbiddenException(
        'A sincronização com o Google Drive é da conta dona desta instância. ' +
          'Envie suas faturas em CSV por POST /import.',
      );
    }

    return true;
  }
}
