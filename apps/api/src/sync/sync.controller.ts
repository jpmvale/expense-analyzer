import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser } from '../auth/current-user.decorator';
import { OwnerGuard } from '../auth/owner.guard';
import { SyncService } from './sync.service';

/**
 * O `OwnerGuard` cobre as duas rotas, e não só o `POST`: o `GET` conta quando foi
 * a última sincronização do Drive, e para quem não tem Drive isso não é uma
 * pergunta que faça sentido. Quem importa CSV vê o mesmo registro pela resposta
 * de `POST /import` e pelo histórico dela.
 */
@ApiTags('sync')
@Controller('sync')
@UseGuards(OwnerGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @ApiOperation({
    summary: 'Se há uma sincronização em andamento, e como terminou a última',
  })
  @ApiResponse({ status: 403, description: 'A conta não é a dona da instância' })
  status(@CurrentUser() userId: Types.ObjectId) {
    return this.syncService.status(userId);
  }

  @Post()
  // 202, e não 201: a resposta sai antes de a ingestão terminar, então não há
  // recurso criado para apontar. É a diferença entre "aceitei o pedido" e
  // "pronto, está feito" — e aqui só a primeira é verdade.
  @HttpCode(202)
  @ApiOperation({ summary: 'Dispara uma sincronização com as faturas da fonte configurada' })
  @ApiResponse({ status: 202, description: 'Sincronização iniciada; acompanhe por GET /sync' })
  @ApiResponse({ status: 403, description: 'A conta não é a dona da instância' })
  @ApiResponse({ status: 409, description: 'Já existe uma sincronização em andamento' })
  start(@CurrentUser() userId: Types.ObjectId) {
    return this.syncService.start(userId);
  }
}
