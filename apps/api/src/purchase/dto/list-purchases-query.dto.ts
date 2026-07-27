import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

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
}
