import { AlertCircleIcon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ImportResult, ImportedFile } from '@/interface/import';
import { cn } from '@/lib/utils';
import { importCsvs } from '../../api/client';

/** Só `.csv`: é o que o parser lê, e recusar aqui evita a viagem até a API. */
function onlyCsv(files: FileList | null): File[] {
  return [...(files ?? [])].filter((file) => file.name.toLowerCase().endsWith('.csv'));
}

/** Uma linha do relato por arquivo. */
function FileRow({ file }: { file: ImportedFile }) {
  if (file.skipped) {
    return (
      <li className="flex items-start gap-2 py-2 text-sm">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{file.name}</p>
          <p className="text-muted-foreground">Ficou de fora: {file.skipped}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 py-2 text-sm">
      <FileSpreadsheetIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">{file.name}</p>
        <p className="text-muted-foreground">
          Fatura de {file.month} · {file.purchases}{' '}
          {file.purchases === 1 ? 'compra' : 'compras'}
          {file.discarded > 0 &&
            ` · ${file.discarded} ${file.discarded === 1 ? 'linha ignorada' : 'linhas ignoradas'}`}
          {/* Dizer de onde veio o mês importa quando ele foi adivinhado: é a
              única chance de a pessoa perceber que a fatura entrou no mês errado
              e reenviar o arquivo com o nome certo. */}
          {file.monthFrom === 'content' && ' · mês deduzido pelas datas do arquivo'}
        </p>
      </div>
    </li>
  );
}

function Import() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const choose = useCallback((files: File[]) => {
    setSelected(files);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(onlyCsv(event.dataTransfer.files));
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    choose(onlyCsv(event.target.files));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await importCsvs(selected));
      setSelected([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Importar faturas"
        description="Mande os CSVs das suas faturas. Reenviar um mês sobrescreve o que estava lá, e as suas regras de categoria são reaplicadas depois — importar de novo nunca desfaz o que você classificou."
      />

      <Card className="p-6">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center transition-colors',
            dragging ? 'border-primary bg-accent/40' : 'border-border',
          )}
        >
          <UploadIcon className="size-6 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">Arraste os arquivos .csv aqui</p>
            <p className="text-muted-foreground">
              Ou escolha vários de uma vez — mandar o histórico inteiro numa leva só é melhor, porque
              a categorização de um mês aproveita o que os outros já sabiam.
            </p>
          </div>

          <input
            ref={inputRef}
            id="files"
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={handleInput}
            className="hidden"
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            Escolher arquivos
          </Button>
        </div>

        {selected.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selected.length} {selected.length === 1 ? 'arquivo pronto' : 'arquivos prontos'} para
              enviar.
            </p>
            <Button onClick={send} disabled={busy}>
              {busy ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
        )}
      </Card>

      {result && (
        <Card className="mt-4 p-6">
          <h2 className="text-sm font-medium">
            {result.result.bills} {result.result.bills === 1 ? 'fatura gravada' : 'faturas gravadas'}
            , {result.result.purchases} compras
            {result.result.classified > 0 &&
              ` · ${result.result.classified} reclassificadas pelas suas regras`}
          </h2>

          <ul className="mt-2 divide-y divide-border">
            {result.files.map((file) => (
              <FileRow key={file.name} file={file} />
            ))}
          </ul>

          {/* O relato cru fica por último e sem destaque: é onde aparecem os
              avisos que não são erro e não mudam contagem nenhuma — dois arquivos
              disputando o mesmo mês, linhas com valor ilegível. */}
          {result.log.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Relato da importação
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {result.log.join('\n')}
              </pre>
            </details>
          )}
        </Card>
      )}
    </>
  );
}

export default Import;
