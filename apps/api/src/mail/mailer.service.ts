import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Manda e-mail pelo Resend — a mesma conta e o mesmo domínio verificado que o
 * `~/bin/com-alerta.sh` da VPS usa para avisar quando um job de cron falha.
 *
 * Uma requisição HTTP com `fetch`, e não o SDK do Resend: é um `POST` com três
 * campos, e uma dependência a mais aqui seria mais superfície para manter do que
 * serviço prestado.
 *
 * **De onde vêm as credenciais.** Elas moram em `~/.config/alerta.env` na VPS,
 * fora deste projeto, e o compose monta esse arquivo dentro do container; o
 * caminho chega em `MAIL_ENV_FILE`. Montar em vez de listar o arquivo no
 * `env_file:` do compose evita um desencontro de aspas: o `EMAIL_FROM` de lá tem
 * o formato `nome <endereço>` e está entre aspas por causa do `source` do shell,
 * e o parser do compose não trata aspas como o do shell trata.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly apiKey?: string;
  private readonly from?: string;

  constructor(config: ConfigService) {
    // O arquivo é carregado aqui, e não no `main.ts`, porque só este serviço
    // precisa dele — e porque em desenvolvimento ele simplesmente não existe.
    const envFile = config.get<string>('MAIL_ENV_FILE');
    if (envFile) {
      try {
        process.loadEnvFile(envFile);
      } catch {
        this.logger.warn(`MAIL_ENV_FILE aponta para ${envFile}, que não pôde ser lido.`);
      }
    }

    this.apiKey = process.env.RESEND_API_KEY ?? config.get<string>('RESEND_API_KEY');
    this.from = process.env.EMAIL_FROM ?? config.get<string>('EMAIL_FROM');

    if (!this.configured) {
      this.logger.warn(
        'Sem RESEND_API_KEY/EMAIL_FROM: os e-mails serão escritos no log em vez de enviados.',
      );
    }
  }

  private get configured(): boolean {
    return Boolean(this.apiKey && this.from);
  }

  /**
   * Envia, ou registra no log quando não há credencial.
   *
   * O fallback não é preguiça: em desenvolvimento não existe Resend nenhum, e
   * derrubar o pedido de redefinição por causa disso tornaria o fluxo inteiro
   * impossível de exercitar fora de produção. Com o log, o link de redefinição
   * aparece no terminal da API e o caminho é o mesmo até o fim.
   *
   * Nunca relança. Quem chama é a rota de "esqueci minha senha", que responde a
   * mesma coisa em qualquer caso — deixar um erro do Resend virar 500 diria ao
   * cliente que aquele endereço existe, que é justamente o que ela esconde.
   */
  async send({ to, subject, text }: Email): Promise<void> {
    if (!this.configured) {
      this.logger.warn(`E-mail NÃO enviado (sem credencial) para ${to} — "${subject}":\n${text}`);
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, text }),
      });

      if (!response.ok) {
        // O corpo do erro do Resend é o que diz se foi domínio não verificado,
        // chave revogada ou cota — e sem ele o log diria só "falhou".
        this.logger.error(`Resend recusou (${response.status}): ${await response.text()}`);
      }
    } catch (error) {
      this.logger.error(`Falha ao falar com o Resend: ${String(error)}`);
    }
  }
}
