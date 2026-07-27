import type Bill from '@/interface/bill';

/**
 * Categorias que ganham coluna na tabela de faturas, ordenadas pelo quanto pesam
 * no histórico inteiro.
 *
 * Saem dos próprios dados, e não de uma lista fixa: antes eram 12 categorias
 * escritas à mão, com acento e tudo, e qualquer categoria vinda de uma fatura
 * real fora dessa lista existia na API e simplesmente não aparecia na tela.
 *
 * A ordem é por volume, não alfabética: alfabética empurrava `transporte` para o
 * fim e trazia `estorno` para o começo, deixando o que menos pesa em primeiro.
 */
export function categoriesByVolume(bills: Bill[]): string[] {
  const totals = new Map<string, number>();

  for (const bill of bills) {
    for (const { categoryByMonth, totalCategory } of bill.categoriesResult) {
      totals.set(categoryByMonth, (totals.get(categoryByMonth) ?? 0) + totalCategory);
    }
  }

  return [...totals.entries()]
    .sort(([aName, aTotal], [bName, bTotal]) =>
      // Empate desfeito pelo nome, para a ordem não depender da iteração do Map.
      bTotal === aTotal ? aName.localeCompare(bName, 'pt-BR') : bTotal - aTotal,
    )
    .map(([category]) => category);
}
