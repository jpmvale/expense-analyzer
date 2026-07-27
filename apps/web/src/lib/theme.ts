/**
 * Tema escuro/claro.
 *
 * O escuro é o padrão do produto, então ele é o valor dos tokens em `:root` e o
 * claro é a exceção — o atributo só é escrito no <html> quando o tema é claro
 * ou quando o usuário escolheu explicitamente. `system` acompanha o SO.
 */
export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'expense-analyzer:theme';

export function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
}

/** Resolve `system` para o tema efetivo e aplica no <html>. */
export function applyTheme(theme: Theme): void {
  const effective = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = effective;
  localStorage.setItem(STORAGE_KEY, theme);
}
