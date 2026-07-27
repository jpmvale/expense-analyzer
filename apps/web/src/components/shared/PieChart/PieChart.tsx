import { PieChart, pieArcLabelClasses } from '@mui/x-charts';
import ChartData from '../../../interface/chartData';

const currency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Gasto por categoria. Sem `width`, o gráfico acompanha a largura do container. */
const PieChartComponent = ({
  chartData = [],
  width,
  height,
}: {
  chartData: ChartData[];
  width?: number;
  height: number;
}) => {
  const series = chartData
    .map((data) => ({
      value: data.data.reduce((acc, purchase) => acc + purchase.amount, 0),
      label: data.value,
    }))
    .sort((a, b) => a.value - b.value);

  return (
    <PieChart
      series={[
        {
          data: series,
          // x-charts v7 renomeou as chaves de `highlightScope`
          // (faded/highlighted → fade/highlight).
          highlightScope: { fade: 'global', highlight: 'item' },
          innerRadius: 40,
          faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
          // Só o nome da categoria: com o valor junto, o rótulo das fatias
          // grandes estoura a área do gráfico. O valor fica no tooltip.
          arcLabel: (item) => String(item.label ?? ''),
          arcLabelMinAngle: 20,
          valueFormatter: (item) => currency(item.value),
        },
      ]}
      sx={{
        [`& .${pieArcLabelClasses.root}`]: { fill: 'white', fontWeight: 'bold' },
      }}
      width={width}
      height={height}
    />
  );
};

export default PieChartComponent;
