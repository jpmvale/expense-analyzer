/**
 * Uma ilustração do painel — não é uma captura de tela, e o texto ao lado dela
 * diz isso.
 *
 * Desenhada em SVG com os tokens do tema (`assets/globals.css`) em vez de uma
 * imagem: acompanha claro e escuro sozinha, não pesa no bundle, e não abre a
 * porta para carregar arquivo de fora — o front hoje não busca nada de terceiros,
 * e uma landing não é motivo para começar.
 *
 * Os números são inventados, e de propósito parecidos com uma fatura de verdade:
 * uma série que sobe e desce, um degrau de preço de assinatura. Inventar valores
 * redondos e triunfais mostraria um app que não existe.
 */

/** Gasto mensal, em altura relativa (0–1). Doze meses, com a variação de sempre. */
const MESES = [0.52, 0.61, 0.48, 0.72, 0.66, 0.58, 0.83, 0.7, 0.62, 0.9, 0.75, 0.68];

/**
 * A escada de preço de uma assinatura: dois patamares e o degrau entre eles.
 *
 * As larguras somam 152 e o grupo começa em 152, então a linha termina em 304 —
 * a mesma margem de 16 que as barras respeitam do outro lado. Encostar na borda
 * do cartão faria o desenho parecer cortado, e não desenhado.
 */
const DEGRAUS = [
  { x: 0, largura: 88, y: 30 },
  { x: 88, largura: 64, y: 18 },
];

export function PanelMock() {
  return (
    <svg
      viewBox="0 0 320 200"
      role="img"
      aria-label="Ilustração do painel: gasto por mês em barras e a evolução de preço de uma assinatura"
      className="w-full"
    >
      {/* Cartão de trás, como o do app */}
      <rect x="0" y="0" width="320" height="200" rx="12" fill="var(--card)" />
      <rect
        x="0.5"
        y="0.5"
        width="319"
        height="199"
        rx="12"
        fill="none"
        stroke="var(--border)"
      />

      {/* Título e valor do topo */}
      <rect x="16" y="16" width="64" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="16" y="30" width="96" height="12" rx="4" fill="var(--foreground)" opacity="0.85" />

      {/* Barras: gasto por mês */}
      {MESES.map((altura, i) => {
        const largura = 18;
        const vao = 6;
        const x = 16 + i * (largura + vao);
        const alturaMax = 78;
        const h = Math.round(altura * alturaMax);
        return (
          <rect
            key={i}
            x={x}
            y={140 - h}
            width={largura}
            height={h}
            rx="3"
            fill="var(--chart-1)"
            // O último mês mais claro: é o que a Visão geral destaca como a
            // fatura mais recente.
            opacity={i === MESES.length - 1 ? 1 : 0.55}
          />
        );
      })}

      {/* Linha de base das barras */}
      <line x1="16" y1="141" x2="304" y2="141" stroke="var(--chart-grid)" />

      {/* Rodapé: a escada de preço de uma assinatura */}
      <rect x="16" y="154" width="140" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.4" />
      <g transform="translate(152, 150)">
        {DEGRAUS.map((degrau, i) => (
          <line
            key={i}
            x1={degrau.x}
            y1={degrau.y}
            x2={degrau.x + degrau.largura}
            y2={degrau.y}
            stroke="var(--cat-3)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
        {/* O degrau em si: o reajuste que o app aponta */}
        <line x1="88" y1="30" x2="88" y2="18" stroke="var(--cat-3)" strokeWidth="2.5" />
        <circle cx="88" cy="18" r="3.5" fill="var(--cat-3)" />
      </g>
    </svg>
  );
}
