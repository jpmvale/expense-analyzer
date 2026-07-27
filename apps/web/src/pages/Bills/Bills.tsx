import { Alert } from '@mui/material';
import { useEffect, useState } from 'react';
import { listBills } from '../../api/client';
import { AppBar } from '../../components/layout/AppBar';
import { Table } from '../../components/shared/Table';
import type Bill from '../../interface/bill';
import { Column } from '../../interface/tableColumn';

const currency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const percentage = (value: number) => (value ? `${value.toFixed(2)}%` : '-');

/** Categorias com coluna própria na tabela de faturas. */
const CATEGORY_COLUMNS = [
  ['supermercado', 'Supermercado'],
  ['eletrônicos', 'Eletrônicos'],
  ['transporte', 'Transporte'],
  ['restaurante', 'Restaurante'],
  ['serviços', 'Serviços'],
  ['vestuário', 'Vestuário'],
  ['lazer', 'Lazer'],
  ['saúde', 'Saúde'],
  ['casa', 'Casa'],
  ['viagem', 'Viagem'],
  ['educação', 'Educação'],
  ['outros', 'Outros'],
] as const;

const columns: Column<Bill>[] = [
  { id: 'month', label: 'Mês', minWidth: 50 },
  { id: 'valuePaid', label: 'Valor pago', minWidth: 70, format: currency },
  { id: 'total', label: 'Total', minWidth: 70, format: currency },
  { id: 'frequency', label: 'Compras', minWidth: 50 },
  ...CATEGORY_COLUMNS.map(([id, label]) => ({
    id,
    label,
    minWidth: 20,
    formatPercentage: percentage,
  })),
];

const Bills = () => {
  const [rows, setRows] = useState<Bill[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBills()
      .then(setRows)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  return (
    <AppBar>
      {error && <Alert severity="error">Não foi possível carregar as faturas: {error}</Alert>}
      <Table columns={columns} rows={rows} />
    </AppBar>
  );
};

export default Bills;
