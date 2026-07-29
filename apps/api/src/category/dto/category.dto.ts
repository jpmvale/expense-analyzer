import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * O nome da categoria vira fatia na barra empilhada e rótulo na legenda. O teto
 * de 40 caracteres é onde o rótulo ainda cabe na legenda do celular — acima
 * disso o usuário só descobriria o problema depois de classificar tudo.
 */
export class CreateCategoryDto {
  @ApiProperty({ description: 'Nome da categoria', example: 'mercado livre' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}

export class RenameCategoryDto {
  @ApiProperty({
    description:
      'Novo nome. Apontar para uma categoria que já existe **mescla** as duas — é assim que se ' +
      'junta "mercado" e "supermercado"',
    example: 'supermercado',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}

export class ConsolidationExceptionDto {
  @ApiProperty({
    description: 'O título exato a manter fora do trecho, como veio em `conflicts[].title`',
    example: 'Pastel Dupark',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'A categoria a preservar para este título, como veio em `conflicts[].category`',
    example: 'restaurante',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category: string;
}

export class ConsolidateDto {
  @ApiProperty({
    description: 'O trecho que passa a valer, como veio de `GET /category-rule/consolidation`',
    example: 'shopee express ',
  })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'A categoria de destino', example: 'Shopee' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category: string;

  @ApiPropertyOptional({
    description:
      'Títulos de `conflicts` a manter na categoria atual, virando regra `exact` antes do trecho ' +
      'entrar. Resolve um conflito pequeno sem abrir mão do resto da consolidação nem mudar a ' +
      'categoria de quem foi listado aqui.',
    type: [ConsolidationExceptionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsolidationExceptionDto)
  exceptions?: ConsolidationExceptionDto[];
}

export class DismissConsolidationDto {
  @ApiProperty({ description: 'A categoria da sugestão', example: 'Shopee' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({
    description: 'O trecho da sugestão, exatamente como veio de `GET /category-rule/consolidation`',
    example: 'shopee',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreateRuleDto {
  @ApiProperty({
    description:
      '`exact` casa o título inteiro — é o que nasce de um clique na tela. `contains` casa um ' +
      'trecho, e pega de uma vez as variações que o emissor inventa a cada mês',
    enum: ['exact', 'contains'],
    example: 'exact',
  })
  @IsIn(['exact', 'contains'])
  kind: 'exact' | 'contains';

  @ApiProperty({
    description: 'O título inteiro (`exact`) ou o trecho a procurar nele (`contains`)',
    example: 'Mercadolivre*Mercadol',
  })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'Categoria de destino', example: 'mercado livre' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category: string;
}
