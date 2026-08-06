import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  username: string;

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
