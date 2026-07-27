import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './assets/globals.css';
import { applyTheme, readStoredTheme } from './lib/theme';
import router from './routes';

// Aplicado antes do primeiro render para não haver flash de tema claro.
applyTheme(readStoredTheme());

/*
 * TRANSITÓRIO — sai junto com o MUI na última etapa da migração para o shadcn.
 *
 * Enquanto as telas ainda são MUI, ele precisa saber que o fundo é escuro; senão
 * tabelas e campos renderizam claros sobre o fundo escuro do Tailwind e a app
 * fica ilegível entre uma etapa e outra. Os valores espelham `globals.css`.
 */
const muiDark = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#09090b', paper: '#101013' },
    text: { primary: '#f4f4f5', secondary: '#8b8b95' },
    primary: { main: '#34d399' },
    divider: '#232327',
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={muiDark}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
);
