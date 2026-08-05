/**
 * De onde vêm as faturas e como chegar nelas.
 *
 * É um argumento, e não um módulo que lê o `.env` sozinho como era no extractor.
 * A diferença importa desde que a API passou a disparar a ingestão: ela lê
 * ambiente pelo `ConfigService` do Nest, o extractor lê por `dotenv`, e um
 * `config` global obrigaria os dois a concordar sobre quem carrega o `.env` e
 * quando — no processo do Nest, um `dotenv` na carga do módulo roda antes da
 * configuração dele e passaria por cima.
 */
export interface IngestionConfig {
  /** `drive` busca no Google Drive; `local` lê um diretório da máquina. */
  source: 'drive' | 'local';
  /** Fonte `local`: diretório com os CSVs, em caminho absoluto. */
  billsDir: string;
  /** Fonte `drive`: filtro de busca na sintaxe da Drive API v3. */
  driveFileQuery: string;
  /** Fonte `drive`: OAuth client baixado do Google Cloud Console. */
  googleCredentialsPath: string;
  /** Fonte `drive`: refresh token gerado no primeiro consentimento. */
  googleTokenPath: string;
  /**
   * Se o primeiro consentimento do Google pode abrir um navegador e esperar.
   *
   * Verdadeiro no `pnpm extract`, que é um comando de terminal com uma pessoa na
   * frente. **Falso na API**, e não por preferência: o `@google-cloud/local-auth`
   * sobe um servidor local, abre o navegador do host e bloqueia até alguém
   * autorizar. Num container isso não abre navegador nenhum — a requisição
   * simplesmente ficaria pendurada até o timeout, sem dizer por quê. Sem token
   * salvo, é melhor falhar na hora com o texto que explica o que fazer.
   */
  allowInteractiveAuth: boolean;
}
