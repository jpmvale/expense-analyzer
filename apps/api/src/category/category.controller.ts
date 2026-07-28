import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import {
  ConsolidateDto,
  CreateCategoryDto,
  CreateRuleDto,
  DismissConsolidationDto,
  RenameCategoryDto,
} from './dto/category.dto';

@ApiTags('category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Categorias em que se pode classificar, com quantas compras cada uma tem',
  })
  listCategories() {
    return this.categoryService.listCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma categoria, antes de qualquer compra usá-la' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createCategory(dto);
  }

  @Patch(':name')
  @ApiOperation({
    summary: 'Renomeia a categoria — apontar para uma que já existe mescla as duas',
  })
  renameCategory(@Param('name') name: string, @Body() dto: RenameCategoryDto) {
    return this.categoryService.renameCategory(name, dto);
  }

  @Delete(':name')
  @HttpCode(204)
  @ApiOperation({ summary: 'Apaga uma categoria que não está em uso' })
  deleteCategory(@Param('name') name: string) {
    return this.categoryService.deleteCategory(name);
  }
}

@ApiTags('category')
@Controller('category-rule')
export class CategoryRuleController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({
    summary: 'As regras do usuário, cada uma com quantas compras e títulos ela governa hoje',
  })
  listRules() {
    return this.categoryService.listRuleUsage();
  }

  @Get('consolidation')
  @ApiOperation({
    summary:
      'Onde um punhado de regras `exact` viraria uma `contains` — incluindo as bloqueadas, ' +
      'com o que elas levariam junto',
  })
  listConsolidations() {
    return this.categoryService.listConsolidations();
  }

  /*
   * Descartar e restaurar são dois `POST` com corpo, e não um `DELETE` com o par
   * na URL: o trecho carrega espaço e `*` (`shopee *`), que num path só funciona
   * escapado — e `DELETE` não leva corpo.
   */
  @Post('consolidation/dismiss')
  @HttpCode(204)
  @ApiOperation({ summary: 'Esconde uma sugestão de consolidação da lista' })
  dismissConsolidation(@Body() dto: DismissConsolidationDto) {
    return this.categoryService.dismissConsolidation(dto);
  }

  @Post('consolidation/restore')
  @HttpCode(204)
  @ApiOperation({ summary: 'Devolve à lista uma sugestão descartada' })
  restoreConsolidation(@Body() dto: DismissConsolidationDto) {
    return this.categoryService.restoreConsolidation(dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Cria ou atualiza uma regra e reclassifica as compras que ela alcança',
  })
  upsertRule(@Body() dto: CreateRuleDto) {
    return this.categoryService.upsertRule(dto);
  }

  @Post('consolidate')
  @ApiOperation({
    summary: 'Troca as regras `exact` cobertas pelo trecho por uma `contains`, reaplicando uma vez',
  })
  consolidate(@Body() dto: ConsolidateDto) {
    return this.categoryService.consolidate(dto);
  }

  @Post('reapply')
  @ApiOperation({
    summary: 'Reclassifica a base com as regras e a lista de encargos de agora, sem reextrair',
  })
  reapply() {
    return this.categoryService.reapply();
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Apaga a regra e devolve as compras dela à categoria que veio da fatura',
  })
  deleteRule(@Param('id') id: string) {
    return this.categoryService.deleteRule(id);
  }
}
