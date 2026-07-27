/** Caixa baixa e sem acento — a forma em que títulos e regras se comparam. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Categorias inferidas por palavra-chave no título, para quando o CSV não traz
 * categoria útil, o usuário ainda não criou uma regra e o título nunca apareceu
 * categorizado antes.
 *
 * As chaves casam por trecho do título, já normalizado, então `ifd*` pega
 * `Ifd*Pampas Real` e `Ifd*Idayanne Conceicao` de uma vez. São marcas e ramos,
 * nunca meio de pagamento: `nupay` aparece tanto em `iFood - NuPay` quanto em
 * `E-AÍ CLUBE AUTOMOBILISTA S.A. - NuPay` e não diz nada sobre o tipo do gasto.
 *
 * Esta tabela é o piso, não o teto: ela existe para uma base nova não começar
 * inteiramente em `outros`. Quem manda é a regra do usuário, que cobre o mesmo
 * terreno com `contains` e não exige mexer no código.
 */
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  // Encargos vem primeiro: são os títulos que o próprio emissor gera, e nenhum
  // estabelecimento se chama assim. `iof de atraso` é encargo; o IOF de uma
  // compra internacional é imposto sobre um gasto real e não entra aqui.
  encargos: [
    'saldo em atraso',
    'credito de atraso',
    'multa de atraso',
    'iof de atraso',
    'juros de',
    'encargos de',
    'anuidade',
  ],
  transporte: ['uber', '99app', '99 app', 'cabify', 'posto ', 'estacionamento', 'combustivel'],
  restaurante: [
    'ifood',
    'ifd*',
    'ze delivery',
    'restaurante',
    'pizzaria',
    'burger',
    'gastrobar',
    'padaria',
    'casa de paes',
    'lanchonete',
    'cafe ',
  ],
  supermercado: [
    'mateus',
    'armazzem',
    'emporio',
    'supermerc',
    'mercadinho',
    'hortifruti',
    'atacad',
  ],
  // As chaves são o nome da categoria como ela já existe na base — com acento,
  // senão `saude` viraria uma categoria separada de `saúde`.
  saúde: ['drogasil', 'drogaria', 'farmacia', 'academia', 'smart fit', 'clinica', 'laboratorio'],
  serviços: ['google', 'youtube', 'spotify', 'netflix', 'amazon prime', 'microsoft', 'openai'],
  lazer: ['sinuca', 'cinema', 'clube da bola', 'q-ball', 'arena '],
};

/** Categoria sugerida pelo título, ou `null` quando nenhuma palavra-chave casa. */
export function categoryFromKeywords(title: string): string | null {
  const normalized = normalize(title);
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }
  return null;
}
