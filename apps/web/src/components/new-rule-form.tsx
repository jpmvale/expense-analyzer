import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { CategoryPicker } from '@/components/category-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Category, RuleKind } from '@/interface/category';

export interface NewRuleRequest {
  kind: RuleKind;
  value: string;
  category: string;
}

/**
 * Cria uma regra do zero, digitando o trecho.
 *
 * As outras duas telas só oferecem regra a partir de algo que já existe: um
 * título clicado na tabela de Compras, ou uma sugestão em Sem categoria. O que
 * faltava era o caso em que não há nada para clicar ainda — você sabe que um
 * estabelecimento vai aparecer, ou quer capturar de uma vez um trecho que
 * nenhuma compra individual sugeriu.
 *
 * Escolher a categoria já submete, como em `UncategorizedList`: não há um
 * segundo botão de "salvar" depois de escolher, porque a escolha é a ação.
 */
export function NewRuleForm({
  categories,
  onCreate,
}: {
  categories: Category[];
  onCreate: (request: NewRuleRequest) => Promise<void>;
}) {
  const [kind, setKind] = useState<RuleKind>('contains');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = value.trim();

  const create = async (category: string) => {
    setBusy(true);
    try {
      await onCreate({ kind, value: trimmed, category });
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => setKind((previous) => (previous === 'exact' ? 'contains' : 'exact'))}
          className="shrink-0 self-start sm:self-auto"
          aria-label={`Tipo da regra: ${kind === 'contains' ? 'contém' : 'exato'}. Clique para trocar.`}
        >
          <Badge variant={kind === 'contains' ? 'default' : 'outline'}>
            {kind === 'contains' ? 'contém' : 'exato'}
          </Badge>
        </button>

        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={kind === 'contains' ? 'Trecho a procurar no título…' : 'Título exato…'}
          aria-label="Trecho ou título da nova regra"
          disabled={busy}
          className="flex-1"
        />

        <CategoryPicker categories={categories} onSelect={create} align="end">
          <Button variant="outline" disabled={busy || trimmed === ''} className="w-full shrink-0 sm:w-auto">
            <PlusIcon className="size-4" />
            Nova regra
          </Button>
        </CategoryPicker>
      </div>
    </Card>
  );
}
