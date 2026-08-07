/**
 * O painel, ilustrado — e o argumento da página, não a decoração dela.
 *
 * Cresceu de propósito: antes era um cartãozinho ao lado do texto, e o que este
 * app tem de diferente é justamente a **série longa**. Um desenho pequeno de doze
 * barras não diz "oito anos de fatura"; um total em corpo grande com a série
 * inteira embaixo, e o reajuste apontado sobre ela, diz.
 *
 * Os números são inventados, e a legenda ao lado avisa. Ficam **dentro** da
 * ilustração de propósito: no texto do hero, um valor grande passaria por dado
 * real da pessoa que lê — e nenhum número de verdade tem por que aparecer numa
 * página pública.
 *
 * Desenhado em SVG com os tokens do tema (`assets/globals.css`), sem imagem
 * externa: acompanha claro e escuro sozinho e não puxa arquivo de fora.
 */

/** Gasto mensal em altura relativa (0–1). Vinte e quatro meses — a cara de uma série longa. */
const MESES = [
  0.42, 0.55, 0.38, 0.61, 0.5, 0.47, 0.66, 0.58, 0.44, 0.7, 0.52, 0.6, 0.48, 0.63, 0.57, 0.72,
  0.54, 0.66, 0.59, 0.78, 0.62, 0.83, 0.68, 0.75,
];

const LARGURA = 360;
const BASE = 150;
const ALTURA_MAX = 84;

export function PanelMock() {
  const vao = 2.5;
  const largura = (LARGURA - 32 - vao * (MESES.length - 1)) / MESES.length;
  const ultimo = MESES.length - 1;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} 176`}
      role="img"
      aria-label="Ilustração do painel: total do período, gasto mês a mês em barras e um reajuste de assinatura apontado no último mês"
      className="w-full"
    >
      {/* Rótulo e total — o corpo grande é o que faz a série parecer longa */}
      <text x="16" y="26" fontSize="9" letterSpacing="1" fill="var(--muted-foreground)">
        DOIS ANOS DE FATURA, LIDOS
      </text>
      <text
        x="16"
        y="60"
        fontSize="30"
        fontWeight="640"
        letterSpacing="-1"
        fill="var(--foreground)"
        className="tabular"
      >
        R$ 74.320
        <tspan fill="var(--muted-foreground)" opacity="0.5">
          ,18
        </tspan>
      </text>

      {/* A série: os meses mais recentes vêm mais opacos, como na Visão geral */}
      {MESES.map((altura, i) => {
        const h = Math.round(altura * ALTURA_MAX);
        const x = 16 + i * (largura + vao);
        // Do mais apagado ao cheio: dá direção de leitura ao tempo, da esquerda
        // para a direita, sem precisar de eixo.
        const opacidade = i === ultimo ? 1 : 0.3 + (i / ultimo) * 0.45;
        return (
          <rect
            key={i}
            x={x}
            y={BASE - h}
            width={largura}
            height={h}
            rx="1.5"
            fill="var(--chart-1)"
            opacity={opacidade}
          />
        );
      })}
      <line x1="16" y1={BASE + 1} x2={LARGURA - 16} y2={BASE + 1} stroke="var(--chart-grid)" />

      {/* O reajuste da assinatura, apontado sobre o mês em que apareceu */}
      <g>
        <circle cx={LARGURA - 16 - largura / 2} cy={BASE - Math.round(0.75 * ALTURA_MAX) - 8} r="3" fill="var(--cat-3)" />
        <text
          x={LARGURA - 22}
          y={BASE - Math.round(0.75 * ALTURA_MAX) - 16}
          fontSize="9.5"
          textAnchor="end"
          fill="var(--cat-3)"
        >
          assinatura +28%
        </text>
      </g>

      {/* Rodapé do cartão: as categorias do mês, como fatias */}
      <g transform={`translate(16, ${BASE + 14})`}>
        {[
          { largura: 104, cor: 'var(--cat-1)' },
          { largura: 78, cor: 'var(--cat-2)' },
          { largura: 56, cor: 'var(--cat-3)' },
          { largura: 40, cor: 'var(--cat-5)' },
          { largura: 50, cor: 'var(--cat-rest)' },
        ].reduce<{ nodes: React.ReactNode[]; x: number }>(
          (acc, fatia, i) => {
            acc.nodes.push(
              <rect
                key={i}
                x={acc.x}
                y="0"
                width={fatia.largura - 3}
                height="6"
                rx="3"
                fill={fatia.cor}
                opacity="0.85"
              />,
            );
            acc.x += fatia.largura;
            return acc;
          },
          { nodes: [], x: 0 },
        ).nodes}
      </g>
    </svg>
  );
}
