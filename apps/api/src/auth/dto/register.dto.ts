import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  username: string;

  /**
   * Obrigatório porque é o único caminho de volta para quem esquece a senha:
   * sem endereço, recuperar a conta vira um pedido a quem tem acesso ao banco.
   */
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;

  /**
   * Oito caracteres é o piso, e não uma opinião sobre senha forte: sem mínimo
   * nenhum, o `@IsNotEmpty()` aceitaria uma senha de um caractere numa
   * instância exposta na internet.
   */
  @ApiProperty({ example: 'uma senha de pelo menos oito caracteres' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({
    example: 'o código combinado com quem administra a instância',
    description: 'Precisa bater com INVITE_CODE do servidor.',
  })
  @IsString()
  @IsNotEmpty()
  inviteCode: string;
}
