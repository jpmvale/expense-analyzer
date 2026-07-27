import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
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
