import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SORTABLE_FIELDS,
  type SortableField,
  type SortOrder,
} from '../purchase-query';

export class ListPurchasesQueryDto {
  @ApiPropertyOptional({
    description: 'Categorias separadas por vírgula',
    example: 'supermercado,transporte',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Filtra pela **data da compra**. Qualquer dia do mês desejado; o filtro cobre o mês inteiro',
    example: '2024-03-15',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date precisa estar no formato YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    description:
      'Filtra pelo **mês da fatura** em que a compra apareceu — que não é o mesmo que a data ' +
      'da compra: uma compra de 28/02 costuma cair na fatura de março',
    example: '2024-03',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month precisa estar no formato YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ description: 'Busca parcial no título da compra', example: 'uber' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Página, começando em 1', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page precisa ser um inteiro' })
  @Min(1, { message: 'page começa em 1' })
  page?: number;

  @ApiPropertyOptional({
    description: `Linhas por página. Teto de ${MAX_LIMIT} — sem ele, um limite alto traria a coleção inteira e desfaria a paginação`,
    example: DEFAULT_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit precisa ser um inteiro' })
  @Min(1)
  @Max(MAX_LIMIT, { message: `limit vai até ${MAX_LIMIT}` })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Coluna de ordenação',
    enum: SORTABLE_FIELDS,
    default: 'date',
  })
  @IsOptional()
  @IsIn(SORTABLE_FIELDS, {
    message: `sort precisa ser um de: ${SORTABLE_FIELDS.join(', ')}`,
  })
  sort?: SortableField;

  @ApiPropertyOptional({ description: 'Direção da ordenação', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order precisa ser asc ou desc' })
  order?: SortOrder;
}
