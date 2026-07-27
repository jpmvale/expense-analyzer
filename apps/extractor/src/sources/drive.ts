import { readFile, writeFile } from 'node:fs/promises';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { config } from '../config';
import { Bill } from '../interfaces/bill';
import { CategoryMemory, parseBillCsv, referenceMonthFromFileName } from '../parseBillCsv';
import { excludeTrashed } from './driveQuery';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

/** Reaproveita o refresh token salvo, evitando abrir o navegador toda execução. */
async function loadSavedCredentials() {
  try {
    const content = await readFile(config.googleTokenPath, 'utf-8');
    return google.auth.fromJSON(JSON.parse(content));
  } catch {
    return null;
  }
}

async function saveCredentials(client: Awaited<ReturnType<typeof authenticate>>) {
  const content = await readFile(config.googleCredentialsPath, 'utf-8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  await writeFile(
    config.googleTokenPath,
    JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    }),
  );
}

async function authorize() {
  const saved = await loadSavedCredentials();
  if (saved) return saved;

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: config.googleCredentialsPath,
  });

  if (!client.credentials?.refresh_token) {
    throw new Error(
      'O Google não devolveu um refresh token. Revogue o acesso do app em\n' +
        'https://myaccount.google.com/permissions e rode de novo — o refresh token\n' +
        'só vem no primeiro consentimento.',
    );
  }

  await saveCredentials(client);

  // Relê o token recém-salvo em vez de devolver o cliente do `authenticate()`.
  // Aquele cliente não anexa a credencial nas chamadas do googleapis, então a
  // PRIMEIRA execução falhava com "Method doesn't allow unregistered callers"
  // logo depois de o usuário autorizar no navegador — e só funcionava a partir
  // da segunda, quando este mesmo caminho de token salvo passava a ser usado.
  const reloaded = await loadSavedCredentials();
  if (!reloaded) {
    throw new Error(`Token salvo em ${config.googleTokenPath} mas não pôde ser lido de volta.`);
  }
  return reloaded;
}

export async function fetchBillsFromDrive(): Promise<Bill[]> {
  const auth = await authorize();
  const drive = google.drive({ version: 'v3', auth: auth as never });

  const res = await drive.files.list({
    q: excludeTrashed(config.driveFileQuery),
    orderBy: 'name asc',
    fields: 'files(id, name)',
    pageSize: 1000,
  });

  const files = res.data.files ?? [];
  if (files.length === 0) {
    console.warn(`Nenhum arquivo no Drive bateu com o filtro: ${config.driveFileQuery}`);
    return [];
  }

  // A memória é compartilhada entre as faturas: um título categorizado num mês
  // categoriza o mesmo título nos meses em que ele veio sem categoria.
  const memory = new CategoryMemory();
  const bills: Bill[] = [];

  for (const file of files) {
    if (!file.id || !file.name) continue;

    const referenceMonth = referenceMonthFromFileName(file.name);
    if (!referenceMonth) {
      console.warn(`Ignorando "${file.name}": o nome não contém o padrão <ano>-<mês>.`);
      continue;
    }

    const raw = await drive.files.get({ fileId: file.id, alt: 'media' });
    bills.push({ referenceMonth, data: parseBillCsv(String(raw.data), referenceMonth, memory) });
  }

  return bills.sort((a, b) => +a.referenceMonth - +b.referenceMonth);
}
