import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  prefersDark,
  readStoredTheme,
  ThemeContext,
  type Theme,
  type ThemeContextValue,
} from '@/lib/theme';

/**
 * Estado do tema num só lugar. Precisa ser compartilhado — e não um `useState`
 * por componente — porque enquanto durar a migração o MUI também consome este
 * valor para montar o próprio tema. Sem isso, alternar o tema trocaria só as
 * telas já migradas e deixaria as outras escuras sobre fundo claro.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(prefersDark);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      setSystemDark(media.matches);
      if (theme === 'system') applyTheme('system');
    };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme,
      setTheme,
    }),
    [theme, systemDark, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
