import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { NameSubscriptionDto } from './dto/subscription.dto';
import { PurchaseService } from './purchase.service';

@ApiTags('purchase')
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Get()
  @ApiOperation({ summary: 'Lista compras filtradas, com soma, total e ticket médio' })
  listPurchases(@Query() filter: ListPurchasesQueryDto) {
    return this.purchaseService.listPurchases(filter);
  }

  @Get('bill')
  @ApiOperation({ summary: 'Agrega as compras por mês de referência (fatura)' })
  listBills() {
    return this.purchaseService.listBills();
  }

  @Get('recurring')
  @ApiOperation({
    summary: 'Cobranças recorrentes detectadas, com o degrau de preço de cada uma',
  })
  listRecurring() {
    return this.purchaseService.listRecurring();
  }

  @Get('uncategorized')
  @ApiOperation({
    summary: 'Os títulos ainda em "outros", agrupados e ordenados pelo dinheiro parado em cada um',
  })
  listUncategorized() {
    return this.purchaseService.listUncategorized();
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
  nameSubscription(@Body() dto: NameSubscriptionDto) {
    return this.purchaseService.nameSubscription(dto);
  }

  @Delete(':key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Tira o nome formal e devolve a assinatura ao título do cartão' })
  clearSubscriptionName(@Param('key') key: string) {
    return this.purchaseService.clearSubscriptionName(key);
  }
}
