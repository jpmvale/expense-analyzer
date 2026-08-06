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
import { RegisterDto } from './dto/register.dto';
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

/** A sessão como a tela a lê. `isOwner` decide se o botão Sincronizar existe. */
export interface SessionView {
  authenticated: boolean;
  username: string | null;
  isOwner: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Cria uma conta com código de convite e já abre a sessão' })
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<SessionView> {
    const userId = await this.authService.register(dto.username, dto.password, dto.inviteCode);
    await this.openSession(req, userId);
    return this.session(req);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Autentica uma conta e abre a sessão' })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<SessionView> {
    const userId = await this.authService.validate(dto.username, dto.password);
    if (!userId) throw new UnauthorizedException('Usuário ou senha incorretos.');

    await this.openSession(req, userId);
    return this.session(req);
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
  @ApiOperation({ summary: 'Quem está na sessão atual, e se essa conta é a dona da instância' })
  async session(@Req() req: Request): Promise<SessionView> {
    const userId = req.session?.userId;
    if (!userId) return { authenticated: false, username: null, isOwner: false };

    // A conta pode ter sumido do banco depois de a sessão nascer — apagada na
    // mão, ou de um banco que foi recriado. Uma sessão apontando para ninguém é
    // sessão inválida, e não uma sessão sem nome.
    const user = await this.authService.findById(userId);
    if (!user) return { authenticated: false, username: null, isOwner: false };

    return {
      authenticated: true,
      username: user.username,
      isOwner: this.authService.isOwner(user.username),
    };
  }

  /**
   * Regenera antes de gravar o `userId`: uma sessão anônima que já existisse no
   * navegador não vira sessão autenticada por herança — entrar sempre troca o id
   * de sessão, o que fecha a fixação de sessão. Vale para o cadastro pelo mesmo
   * motivo que vale para o login.
   */
  private async openSession(req: Request, userId: string): Promise<void> {
    await regenerate(req.session);
    req.session.userId = userId;
    await save(req.session);
  }
}
