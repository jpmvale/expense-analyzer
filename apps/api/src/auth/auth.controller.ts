import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

function regenerate(session: Request['session']): Promise<void> {
  return new Promise((resolve, reject) => {
    session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function save(session: Request['session']): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroy(session: Request['session']): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Autentica o único usuário do app e abre a sessão' })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<{ username: string }> {
    const userId = await this.authService.validate(dto.username, dto.password);
    if (!userId) throw new UnauthorizedException('Usuário ou senha incorretos.');

    // Regenera antes de gravar o `userId`: uma sessão anônima que já existisse
    // no navegador não vira sessão autenticada por herança — login sempre troca
    // o id de sessão, o que fecha a fixação de sessão.
    await regenerate(req.session);
    req.session.userId = userId;
    await save(req.session);

    return { username: userId };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão — idempotente mesmo sem sessão válida' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await destroy(req.session);
    res.clearCookie('expense.sid');
  }

  @Public()
  @Get('session')
  @ApiOperation({ summary: 'Se a sessão atual está autenticada' })
  session(@Req() req: Request): { authenticated: boolean } {
    return { authenticated: Boolean(req.session?.userId) };
  }
}
