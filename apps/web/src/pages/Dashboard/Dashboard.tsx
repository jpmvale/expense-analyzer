import { Alert, Box } from '@mui/material';
import { AppBar } from '../../components/layout/AppBar';

/** Página ainda não implementada — os gráficos hoje vivem em /purchases. */
const Dashboard = () => {
  return (
    <AppBar>
      <Box sx={{ p: 2 }}>
        <h1>Dashboard</h1>
        <Alert severity="info">
          Ainda não implementado. Os gráficos por mês e por categoria estão na página de Compras.
        </Alert>
      </Box>
    </AppBar>
  );
};

export default Dashboard;
