import { BarChart } from '@mui/x-charts';
import ChartData from '../../../interface/chartData';

const currency = (value: number | null) =>
  value === null ? '' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Eixo Y em forma compacta (R$ 25 mil) — o valor cheio não cabe na margem. */
const compact = (value: number) =>
  value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Total gasto por mês. Sem `width`, o gráfico acompanha a largura do container. */
const BarChartComponent = ({
  chartData = [],
  width,
  height,
}: {
  chartData: ChartData[];
  width?: number;
  height: number;
}) => {
  const months = chartData.map((data) => data.value);
  const values = chartData.map((data) =>
    Number(data.data.reduce((acc, purchase) => acc + purchase.amount, 0).toFixed(2)),
  );

  return (
    <BarChart
      xAxis={[{ data: months, scaleType: 'band' }]}
      yAxis={[{ valueFormatter: compact, width: 60 }]}
      series={[{ data: values, valueFormatter: currency }]}
      width={width}
      height={height}
    />
  );
};

export default BarChartComponent;
