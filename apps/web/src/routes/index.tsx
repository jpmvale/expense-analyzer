import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Bills } from '../pages/Bills';
import { Dashboard } from '../pages/Dashboard';
import { Home } from '../pages/Home';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/purchases" replace /> },
  { path: '/purchases', element: <Home /> },
  { path: '/bills', element: <Bills /> },
  { path: '/dashboard', element: <Dashboard /> },
]);

export default router;
