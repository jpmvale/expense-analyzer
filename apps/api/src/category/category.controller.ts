import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto, CreateRuleDto, RenameCategoryDto } from './dto/category.dto';

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
  @ApiOperation({ summary: 'As regras de classificação criadas pelo usuário' })
  listRules() {
    return this.categoryService.listRules();
  }

  @Post()
  @ApiOperation({
    summary: 'Cria ou atualiza uma regra e reclassifica as compras que ela alcança',
  })
  upsertRule(@Body() dto: CreateRuleDto) {
    return this.categoryService.upsertRule(dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Apaga a regra e devolve as compras dela à categoria que veio da fatura',
  })
  deleteRule(@Param('id') id: string) {
    return this.categoryService.deleteRule(id);
  }
}
