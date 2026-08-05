import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @ApiOperation({
    summary: 'Se há uma sincronização em andamento, e como terminou a última',
  })
  status() {
    return this.syncService.status();
  }

  @Post()
  // 202, e não 201: a resposta sai antes de a ingestão terminar, então não há
  // recurso criado para apontar. É a diferença entre "aceitei o pedido" e
  // "pronto, está feito" — e aqui só a primeira é verdade.
  @HttpCode(202)
  @ApiOperation({ summary: 'Dispara uma sincronização com as faturas da fonte configurada' })
  @ApiResponse({ status: 202, description: 'Sincronização iniciada; acompanhe por GET /sync' })
  @ApiResponse({ status: 409, description: 'Já existe uma sincronização em andamento' })
  start() {
    return this.syncService.start();
  }
}
