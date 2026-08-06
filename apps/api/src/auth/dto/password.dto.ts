import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * O mesmo piso do cadastro. Oito caracteres não é uma opinião sobre senha forte
 * — é o que impede uma senha de um caractere numa instância aberta na internet.
 */
const SENHA = { minimo: 8, maximo: 200 } as const;

export class ChangePasswordDto {
  @ApiProperty({ example: 'a senha de agora' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'a senha nova, com pelo menos oito caracteres' })
  @IsString()
  @MinLength(SENHA.minimo)
  @MaxLength(SENHA.maximo)
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'O token que veio no link do e-mail.' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'a senha nova, com pelo menos oito caracteres' })
  @IsString()
  @MinLength(SENHA.minimo)
  @MaxLength(SENHA.maximo)
  newPassword: string;
}
