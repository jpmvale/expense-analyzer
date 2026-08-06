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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password.dto';
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
  /** Para onde vai o link de redefinição. `null` nas contas anteriores ao campo. */
  email: string | null;
  isOwner: boolean;
}

const ANONIMO: SessionView = {
  authenticated: false,
  username: null,
  email: null,
  isOwner: false,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Cria uma conta com código de convite e já abre a sessão' })
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<SessionView> {
    const userId = await this.authService.register(
      dto.username,
      dto.email,
      dto.password,
      dto.inviteCode,
    );
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
    if (!userId) return ANONIMO;

    // A conta pode ter sumido do banco depois de a sessão nascer — apagada na
    // mão, ou de um banco que foi recriado. Uma sessão apontando para ninguém é
    // sessão inválida, e não uma sessão sem nome.
    const user = await this.authService.findById(userId);
    if (!user) return ANONIMO;

    return {
      authenticated: true,
      username: user.username,
      email: user.email ?? null,
      isOwner: this.authService.isOwner(user.username),
    };
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Troca a senha de quem está logado e derruba as outras sessões da conta',
  })
  @ApiResponse({ status: 401, description: 'A senha atual não confere' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ sessionsEncerradas: number }> {
    const userId = req.session.userId;
    if (!userId) throw new UnauthorizedException('Sessão inválida ou expirada.');

    // A sessão de quem está trocando é poupada pelo `req.sessionID` — sem ele a
    // pessoa se expulsaria ao mudar a própria senha.
    return this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      req.sessionID,
    );
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Manda o link de redefinição — responde igual exista ou não a conta',
  })
  @ApiResponse({
    status: 204,
    description:
      'Sempre. Uma resposta diferente para e-mail conhecido e desconhecido diria a qualquer um ' +
      'quem tem conta nesta instância.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Fecha a redefinição com o token do e-mail' })
  @ApiResponse({ status: 400, description: 'Token inexistente, expirado ou já usado' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
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
