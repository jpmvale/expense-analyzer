import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
