import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * O teto de 40 caracteres é o mesmo do nome de categoria, pelo mesmo motivo: é
 * onde o rótulo ainda cabe na linha da lista no celular.
 */
export class NameSubscriptionDto {
  @ApiProperty({
    description:
      'A chave do grupo de recorrência, como vem em `key` no `GET /purchase/recurring`. É o ' +
      'título normalizado e sem o prefixo do gateway',
    example: 'melimais',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ description: 'O nome pelo qual a assinatura se chama', example: 'Meli+' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}
