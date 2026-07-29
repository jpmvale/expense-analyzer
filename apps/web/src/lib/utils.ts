import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes condicionais resolvendo conflitos do Tailwind (padrão shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Valor em reais, no formato brasileiro. */
export function currency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Valor em reais abreviado, para eixos e cards onde o valor cheio não cabe:
 * 1.234 → "R$ 1,2 mil".
 */
export function compactCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

const MONTH_LABELS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** `2025-03` → `mar/25`. Aceita também um ISO completo. */
export function formatMonth(value: string): string {
  const [year, month] = value.slice(0, 7).split('-');
  return `${MONTH_LABELS[Number(month) - 1]}/${year.slice(2)}`;
}

/** `2025-03-15T00:00:00.000Z` → `15/03/2025`, lido em UTC. */
export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Primeira letra maiúscula, preservando o resto (`eletrônicos` → `Eletrônicos`). */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Se a data é depois de agora — uma parcela já lançada numa fatura futura,
 * ainda não vencida.
 *
 * A tabela de Compras ordena por data decrescente por padrão, e isso põe essas
 * linhas no topo: são as datas mais recentes que existem, mesmo sem terem
 * acontecido ainda. O registro é legítimo — a parcela já está lançada —, e a
 * ordenação por data continua correta; o que faltava era a linha dizer, sem
 * precisar calcular, por que ela não é "a compra mais recente" de verdade.
 */
export function isFutureDate(value: string): boolean {
  return new Date(value).getTime() > Date.now();
}
