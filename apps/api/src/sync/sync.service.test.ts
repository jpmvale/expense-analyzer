import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { startTestDb, type TestDb } from '../testing/mongo';
import { SyncService } from './sync.service';

const CSV = [
  'date,category,title,amount',
  '2026-03-10,transporte,Uber Trip,25.50',
  '2026-03-12,eletrônicos,Mercadolivre*Mercadol,100.00',
  '2026-03-15,,Padaria Bela Vista,18.00',
].join('\n');

/**
 * Espera a ingestão terminar.
 *
 * `start()` responde antes de a extração acabar — é o ponto dela —, então o teste
 * precisa fazer o mesmo que a tela: perguntar de novo até o estado parar de dizer
 * "rodando".
 */
async function waitForIdle(service: SyncService) {
  for (let i = 0; i < 200; i++) {
    const status = await service.status();
    if (!status.running) return status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('a sincronização não terminou a tempo');
}

describe('SyncService', () => {
  let db: TestDb;
  let service: SyncService;
  let billsDir: string;

  before(async () => {
    db = await startTestDb();

    // A fonte `local` em vez do Drive: o que se testa aqui é a costura entre a
    // API e o pacote de ingestão — configuração, gravação, reaplicação e o
    // registro da execução —, e o Drive só acrescentaria rede e um segredo.
    billsDir = await mkdtemp(join(tmpdir(), 'expense-bills-'));
    await writeFile(join(billsDir, 'nubank-2026-03.csv'), CSV);

    // O `ingestionConfigFrom` lê o ambiente no construtor, então isto precisa
    // valer antes de o serviço nascer.
    process.env.EXTRACTOR_SOURCE = 'local';
    process.env.BILLS_DIR = billsDir;

    service = new SyncService(db.runs, db.purchases, db.rules, new ConfigService());
  });

  after(async () => {
    delete process.env.EXTRACTOR_SOURCE;
    delete process.env.BILLS_DIR;
    await db.stop();
  });

  beforeEach(async () => db.clear());

  it('antes da primeira execução, não há o que mostrar', async () => {
    assert.deepEqual(await service.status(), { running: false, lastRun: null });
  });

  it('lê as faturas da fonte e grava as compras', async () => {
    await service.start();
    const { lastRun } = await waitForIdle(service);

    assert.equal(lastRun?.status, 'ok');
    assert.equal(lastRun?.trigger, 'manual');
    assert.equal(lastRun?.bills, 1);
    assert.equal(lastRun?.purchases, 3);
    assert.equal(await db.purchases.countDocuments(), 3);
  });

  /**
   * A garantia que faz o botão ser seguro de apertar: a gravação apaga o mês e
   * devolve as categorias do emissor, e a reaplicação logo depois traz de volta o
   * que a pessoa classificou na tela.
   */
  it('devolve as regras do usuário sobre o mês recém-regravado', async () => {
    await db.rules.create({
      kind: 'exact',
      value: 'Mercadolivre*Mercadol',
      category: 'mercado livre',
    });

    await service.start();
    await waitForIdle(service);

    const purchase = await db.purchases.findOne({ title: 'Mercadolivre*Mercadol' }).exec();
    assert.equal(purchase?.category, 'mercado livre');
    assert.equal(purchase?.sourceCategory, 'eletrônicos');
  });

  it('sincronizar duas vezes não duplica o mês', async () => {
    await service.start();
    await waitForIdle(service);
    await service.start();
    await waitForIdle(service);

    assert.equal(await db.purchases.countDocuments(), 3);
  });

  it('recusa um segundo pedido enquanto o primeiro roda', async () => {
    await db.runs.create({ trigger: 'manual', status: 'running', startedAt: new Date() });

    await assert.rejects(service.start(), /já está em andamento/);
  });

  /**
   * Um container derrubado no meio da extração deixa o documento em `running`
   * para sempre. Como é ele que barra a segunda execução, sem este destravamento
   * o botão ficaria inutilizável até alguém editar o banco na mão.
   */
  it('dá por interrompida uma execução travada e destrava o botão', async () => {
    await db.runs.create({
      trigger: 'cli',
      status: 'running',
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const status = await service.status();
    assert.equal(status.running, false);
    assert.equal(status.lastRun?.status, 'error');
    assert.match(status.lastRun?.message ?? '', /interrompida/);

    await service.start();
    await waitForIdle(service);
  });

  it('a execução pela linha de comando é a última sincronização, como qualquer outra', async () => {
    await db.runs.create({
      trigger: 'cli',
      status: 'ok',
      startedAt: new Date('2026-03-20T07:00:00.000Z'),
      finishedAt: new Date('2026-03-20T07:01:00.000Z'),
      bills: 95,
      purchases: 5744,
    });

    const { lastRun } = await service.status();
    assert.equal(lastRun?.trigger, 'cli');
    assert.equal(lastRun?.bills, 95);
  });

  it('guarda o erro no registro em vez de deixá-lo sumir com o processo', async () => {
    const missing = new ConfigService();
    process.env.BILLS_DIR = join(billsDir, 'nao-existe');
    const failing = new SyncService(db.runs, db.purchases, db.rules, missing);
    process.env.BILLS_DIR = billsDir;

    await failing.start();
    const { lastRun } = await waitForIdle(failing);

    assert.equal(lastRun?.status, 'error');
    assert.match(lastRun?.message ?? '', /Diretório de faturas não encontrado/);
  });
});
