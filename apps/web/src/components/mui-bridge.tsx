import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useMemo, type ReactNode } from 'react';
import { useTheme } from '@/hooks/use-theme';

/*
 * TRANSITÓRIO — este arquivo inteiro é apagado na última etapa da migração para
 * o shadcn/ui, junto com a dependência do MUI.
 *
 * Enquanto o MUI ainda desenha as telas não migradas, ele precisa seguir o mesmo
 * tema que o resto da app; senão o alternador troca só metade da interface e
 * deixa a outra metade escura sobre fundo claro. Os valores espelham os tokens
 * de `globals.css`.
 */
export function MuiBridge({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();

  const theme = useMemo(
    () =>
      createTheme({
        palette:
          resolved === 'dark'
            ? {
                mode: 'dark',
                background: { default: '#09090b', paper: '#101013' },
                text: { primary: '#f4f4f5', secondary: '#8b8b95' },
                primary: { main: '#34d399' },
                divider: '#232327',
              }
            : {
                mode: 'light',
                background: { default: '#fbfbfc', paper: '#ffffff' },
                text: { primary: '#18181b', secondary: '#71717a' },
                primary: { main: '#059669' },
                divider: '#e4e4e7',
              },
      }),
    [resolved],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
