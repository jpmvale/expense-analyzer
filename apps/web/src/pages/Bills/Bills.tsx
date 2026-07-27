import { Alert } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { listBills } from '../../api/client';
import { Table } from '../../components/shared/Table';
import type Bill from '../../interface/bill';
import { buildBillColumns } from '../../lib/billColumns';

const Bills = () => {
  const [rows, setRows] = useState<Bill[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBills()
      .then(setRows)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  // As colunas de categoria saem do que a API devolveu, não de uma lista fixa.
  const columns = useMemo(() => buildBillColumns(rows), [rows]);

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Uma linha por mês de referência, com o peso de cada categoria."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Não foi possível carregar as faturas: {error}
        </Alert>
      )}
      <Table columns={columns} rows={rows} />
    </>
  );
};

export default Bills;
