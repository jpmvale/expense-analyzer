import { Alert, Box, Button, Grid, Paper, SelectChangeEvent, Stack } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { listPurchases } from '../../api/client';
import { AppBar } from '../../components/layout/AppBar';
import { BarChart } from '../../components/shared/BarChart';
import { MonthPicker } from '../../components/shared/MonthPicker';
import { MultiSelectInput } from '../../components/shared/MultiSelectInput';
import { PieChart } from '../../components/shared/PieChart';
import { SearchInput } from '../../components/shared/SearchInput';
import { Table } from '../../components/shared/Table';
import ChartData from '../../interface/chartData';
import { monthEnum } from '../../interface/monthEnum';
import Purchase from '../../interface/purchase';
import { Column } from '../../interface/tableColumn';
import { groupByCategory, groupByMonth } from '../../lib/groupPurchases';

const months: monthEnum = {
  '01': 'JAN',
  '02': 'FEV',
  '03': 'MAR',
  '04': 'ABR',
  '05': 'MAI',
  '06': 'JUN',
  '07': 'JUL',
  '08': 'AGO',
  '09': 'SET',
  '10': 'OUT',
  '11': 'NOV',
  '12': 'DEZ',
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateToBrazilianPattern = (dateString: string) => {
  const [year, month, day] = dateString.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

const columns: Column<Purchase>[] = [
  { id: 'title', label: 'Título', minWidth: 170 },
  { id: 'amount', label: 'Valor', minWidth: 70, format: currency },
  { id: 'category', label: 'Categoria', minWidth: 70 },
  {
    id: 'referenceMonth',
    label: 'Fatura',
    minWidth: 50,
    formatMonth: (value: string) => {
      const [year, month] = value.split('T')[0].split('-');
      return `${months[month]}/${year.slice(2)}`;
    },
  },
  {
    id: 'date',
    label: 'Data',
    minWidth: 80,
    formatDate: formatDateToBrazilianPattern,
  },
];

const Item = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#1A2027' : '#fff',
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

function Home() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [summary, setSummary] = useState<{ total?: number; average?: number; sum?: number }>({});
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);

  const [categoriesInput, setCategoriesInput] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [monthInput, setMonthInput] = useState<Dayjs | null>(null);

  const [dataByMonth, setDataByMonth] = useState<ChartData[]>([]);
  const [dataByCategory, setDataByCategory] = useState<ChartData[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = (event: SelectChangeEvent<string[]>) => {
    const { value } = event.target;
    // No autofill o valor chega serializado como string.
    setCategoriesInput(typeof value === 'string' ? value.split(',') : value);
  };

  const handleTextSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitleInput(event.target.value);
  };

  const fetchData = useCallback(
    async (month: Dayjs | null, title: string, categories: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listPurchases({
          categories,
          title,
          month: month ? month.toDate() : null,
        });
        setPurchases(data.purchases ?? []);
        setSummary({ total: data.total, average: data.average, sum: data.sum });
        setUniqueCategories([...new Set((data.purchases ?? []).map((p) => p.category))]);
        setDataByMonth(groupByMonth(data.purchases ?? []));
        setDataByCategory(groupByCategory(data.purchases ?? []));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clearFilters = () => {
    setCategoriesInput([]);
    setTitleInput('');
    setMonthInput(null);
    void fetchData(null, '', []);
  };

  useEffect(() => {
    void fetchData(null, '', []);
  }, [fetchData]);

  return (
    <AppBar>
      <Box sx={{ p: 2 }}>
        <h1>Compras</h1>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Não foi possível carregar as compras: {error}. A API está no ar em{' '}
            {import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}?
          </Alert>
        )}

        <Grid container spacing={1}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Item>
              <MultiSelectInput
                name="Categorias"
                items={uniqueCategories}
                setCategory={handleCategoryChange}
                category={categoriesInput}
              />
            </Item>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Item>
              <SearchInput value={titleInput} onChange={handleTextSearchChange} />
            </Item>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Item>
              <MonthPicker value={monthInput} onChange={setMonthInput} />
            </Item>
          </Grid>

          <Grid size={12}>
            <Item>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 1 }}>
                <Button
                  variant="contained"
                  onClick={() => void fetchData(monthInput, titleInput, categoriesInput)}
                >
                  Buscar
                </Button>
                <Button variant="outlined" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </Stack>
              <h2>
                <strong>
                  Total: {currency(summary.sum ?? 0)} | Compras: {summary.total ?? 0} | Média:{' '}
                  {currency(summary.average ?? 0)}
                </strong>
              </h2>
            </Item>
          </Grid>

          {!loading && (
            <>
              <Grid size={{ xs: 12, lg: 4 }}>
                <Table rows={purchases} columns={columns} />
              </Grid>
              <Grid size={{ xs: 12, lg: 8 }}>
                {/* Filtrando um mês só, o gráfico por mês teria uma barra só. */}
                {!monthInput && <BarChart chartData={dataByMonth} height={400} />}
                <PieChart chartData={dataByCategory} height={500} />
              </Grid>
            </>
          )}
        </Grid>
      </Box>
    </AppBar>
  );
}

export default Home;
