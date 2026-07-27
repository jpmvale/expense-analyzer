import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './assets/globals.css';
import { MuiBridge } from './components/mui-bridge';
import { ThemeProvider } from './components/theme-provider';
import { applyTheme, readStoredTheme } from './lib/theme';
import router from './routes';

// Aplicado antes do primeiro render para não haver flash de tema claro.
applyTheme(readStoredTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* MuiBridge é transitório: sai com o MUI na última etapa da migração. */}
      <MuiBridge>
        <RouterProvider router={router} />
      </MuiBridge>
    </ThemeProvider>
  </React.StrictMode>,
);
