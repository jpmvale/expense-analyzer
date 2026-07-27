import { useContext } from 'react';
import { ThemeContext } from '@/lib/theme';

/** Tema atual e como trocá-lo. Exige estar sob o <ThemeProvider>. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme precisa estar dentro de <ThemeProvider>.');
  }
  return context;
}
