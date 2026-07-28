import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'jpmvale' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'a senha combinada com você mesmo' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
