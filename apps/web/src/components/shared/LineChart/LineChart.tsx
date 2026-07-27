import { LineChart } from '@mui/x-charts';
import ChartData from '../../../interface/chartData';

const currency = (value: number | null) =>
  value === null ? '' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Evolução do gasto mês a mês. Sem `width`, acompanha a largura do container. */
const LineChartComponent = ({
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
    <LineChart
      xAxis={[{ scaleType: 'point', data: months }]}
      yAxis={[
        {
          // O valor cheio não cabe na margem do eixo; o tooltip mostra em reais.
          valueFormatter: (value: number) =>
            value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }),
          width: 60,
        },
      ]}
      series={[{ data: values, area: true, valueFormatter: currency }]}
      width={width}
      height={height}
      sx={{
        '.MuiLineElement-root': { stroke: '#8884d8', strokeWidth: 2 },
        '.MuiMarkElement-root': {
          stroke: '#8884d8',
          scale: '0.6',
          fill: '#fff',
          strokeWidth: 2,
        },
      }}
    />
  );
};

export default LineChartComponent;
