import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser } from '../auth/current-user.decorator';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { NameSubscriptionDto } from './dto/subscription.dto';
import { PurchaseService } from './purchase.service';

@ApiTags('purchase')
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Get()
  @ApiOperation({ summary: 'Lista compras filtradas, com soma, total e ticket médio' })
  listPurchases(@CurrentUser() userId: Types.ObjectId, @Query() filter: ListPurchasesQueryDto) {
    return this.purchaseService.listPurchases(userId, filter);
  }

  @Get('bill')
  @ApiOperation({ summary: 'Agrega as compras por mês de referência (fatura)' })
  listBills(@CurrentUser() userId: Types.ObjectId) {
    return this.purchaseService.listBills(userId);
  }

  @Get('recurring')
  @ApiOperation({
    summary: 'Cobranças recorrentes detectadas, com o degrau de preço de cada uma',
  })
  listRecurring(@CurrentUser() userId: Types.ObjectId) {
    return this.purchaseService.listRecurring(userId);
  }

  @Get('uncategorized')
  @ApiOperation({
    summary: 'Os títulos ainda em "outros", agrupados e ordenados pelo dinheiro parado em cada um',
  })
  listUncategorized(@CurrentUser() userId: Types.ObjectId) {
    return this.purchaseService.listUncategorized(userId);
  }

  @Get('price-alerts')
  @ApiOperation({
    summary:
      'Reajustes dos últimos 3 ciclos fechados — o aviso da Visão geral, para consumir sem abrir a tela',
  })
  listPriceAlerts(@CurrentUser() userId: Types.ObjectId) {
    return this.purchaseService.listPriceAlerts(userId);
  }
}

/**
 * O nome formal de uma assinatura. Recurso próprio porque não é uma compra: a
 * assinatura é derivada a cada requisição, e o que se guarda é só o apelido.
 */
@ApiTags('purchase')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @ApiOperation({
    summary: 'Batiza a assinatura — rebatizar sobrescreve o nome que estava lá',
  })
  nameSubscription(@CurrentUser() userId: Types.ObjectId, @Body() dto: NameSubscriptionDto) {
    return this.purchaseService.nameSubscription(userId, dto);
  }

  @Delete(':key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Tira o nome formal e devolve a assinatura ao título do cartão' })
  clearSubscriptionName(@CurrentUser() userId: Types.ObjectId, @Param('key') key: string) {
    return this.purchaseService.clearSubscriptionName(userId, key);
  }
}
