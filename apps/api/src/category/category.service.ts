import {
  isReservedCategory,
  normalize,
  PAYMENT_CATEGORY,
  reapplyRules,
  ruleForTitle,
  type ReapplyResult,
} from '@expense/categorization';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { CategoryRule, CategoryRuleDocument } from '../schemas/category-rule.schema';
import {
  ConsolidationDismissal,
  ConsolidationDismissalDocument,
} from '../schemas/consolidation-dismissal.schema';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import {
  ConsolidateDto,
  CreateCategoryDto,
  CreateRuleDto,
  DismissConsolidationDto,
  RenameCategoryDto,
} from './dto/category.dto';
import { createPurchaseStore } from './purchase-store';
import {
  suggestConsolidations,
  type ConsolidationSuggestion,
  type RuledTitle,
} from './rule-consolidation';

export interface CategorySummary {
  name: string;
  /** Quantas compras estão nela hoje. Zero é categoria criada e ainda não usada. */
  purchaseCount: number;
}

/** Uma regra com o tamanho do que ela governa hoje. */
export interface RuleUsage {
  _id: string;
  kind: 'exact' | 'contains';
  value: string;
  category: string;
  updatedAt: Date;
  /**
   * Compras que obedecem a esta regra agora — não as que ela *casa*.
   *
   * A diferença importa: uma `contains` casa com um título que tem regra
   * `exact` própria, e não manda nele. Contar por casamento diria que duas
   * regras governam a mesma compra, e apagar uma delas devolveria um número
   * diferente do prometido.
   */
  purchases: number;
  /** Títulos distintos sob esta regra. Uma regra `exact` governa no máximo um. */
  titles: number;
}

/** Um título distinto da base, com a categoria e o volume que ele carrega. */
interface TitleRow extends RuledTitle {
  purchases: number;
}

/** Uma sugestão de consolidação, com a decisão de escondê-la já aplicada. */
export interface ConsolidationSuggestionView extends ConsolidationSuggestion<CategoryRuleDocument> {
  dismissed: boolean;
}

/**
 * Chave estável para casar sugestão e descarte — os dois lados usam o mesmo par.
 *
 * O separador é um caractere que nem categoria nem trecho podem conter, senão
 * `("shopee a", "b")` e `("shopee", "a b")` cairiam na mesma chave.
 */
function dismissalKey(category: string, value: string): string {
  return `${category}\u0000${value}`;
}

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(CategoryRule.name) private readonly ruleModel: Model<CategoryRuleDocument>,
    @InjectModel(ConsolidationDismissal.name)
    private readonly dismissalModel: Model<ConsolidationDismissalDocument>,
  ) {}

  /**
   * As categorias em que se pode classificar.
   *
   * É a união de duas origens: as que já aparecem nas compras (vieram da fatura
   * ou de uma inferência) e as que o usuário criou e ainda não usou. Ler as duas
   * dispensa migrar a base para dentro da coleção e sobrevive a uma categoria
   * nova chegando numa fatura amanhã.
   *
   * Só o `payment` fica de fora, porque não é categoria: é o pagamento da
   * fatura. `estorno`, `impostos`, `parcelado` e `encargos` aparecem e podem
   * receber compras — a lista já esteve mais curta que isso, e o custo era não
   * haver como mandar um "IOF de compra internacional" para `impostos`.
   */
  async listCategories(userId: Types.ObjectId): Promise<CategorySummary[]> {
    const [counts, created] = await Promise.all([
      this.purchaseModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { userId, category: { $ne: PAYMENT_CATEGORY } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ])
        .exec(),
      this.categoryModel.find({ userId }).exec(),
    ]);

    const byName = new Map<string, number>(counts.map(({ _id, count }) => [_id, count]));
    for (const { name } of created) {
      if (!byName.has(name)) byName.set(name, 0);
    }

    return [...byName]
      .map(([name, purchaseCount]) => ({ name, purchaseCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async createCategory(
    userId: Types.ObjectId,
    { name }: CreateCategoryDto,
  ): Promise<CategorySummary> {
    const clean = name.trim();
    if (clean === '') throw new ConflictException('A categoria precisa de um nome.');
    if (isReservedCategory(clean)) {
      throw new ConflictException(
        `"${clean}" é o pagamento da fatura, não uma categoria de gasto.`,
      );
    }

    const existing = await this.findCategoryByName(userId, clean);
    if (existing) throw new ConflictException(`A categoria "${existing}" já existe.`);

    await this.categoryModel.create({ userId, name: clean });
    return { name: clean, purchaseCount: 0 };
  }

  /**
   * Renomeia — e, quando o destino já existe, mescla.
   *
   * Mudar `category` sozinha não bastaria: a próxima reaplicação leria a
   * `sourceCategory` antiga e desfaria o trabalho na primeira regra que mudasse.
   * Por isso os dois campos são renomeados, junto das regras que apontavam para
   * o nome antigo.
   */
  async renameCategory(
    userId: Types.ObjectId,
    from: string,
    { name }: RenameCategoryDto,
  ): Promise<CategorySummary> {
    const to = name.trim();
    if (to === '') throw new ConflictException('A categoria precisa de um nome.');
    if (isReservedCategory(from) || isReservedCategory(to)) {
      throw new ConflictException('O pagamento da fatura não é uma categoria renomeável.');
    }
    // Só o nome idêntico é no-op. Trocar apenas a caixa — "casa" para "Casa" —
    // é uma renomeação de verdade, e comparar normalizado a engoliria em
    // silêncio, deixando a tela mostrando o nome antigo.
    if (from === to) return this.summaryFor(userId, to);

    const known = await this.listCategories(userId);
    if (!known.some((category) => category.name === from)) {
      throw new NotFoundException(`Categoria "${from}" não encontrada.`);
    }

    await Promise.all([
      this.purchaseModel.updateMany({ userId, category: from }, { $set: { category: to } }).exec(),
      this.purchaseModel
        .updateMany({ userId, sourceCategory: from }, { $set: { sourceCategory: to } })
        .exec(),
      this.ruleModel.updateMany({ userId, category: from }, { $set: { category: to } }).exec(),
    ]);

    // Some com o registro antigo. Numa mescla o destino já existe (ou existe só
    // nas compras), então o novo é criado apenas se ninguém o representa ainda.
    await this.categoryModel.deleteOne({ userId, name: from }).exec();
    if (!(await this.categoryModel.exists({ userId, name: to }))) {
      await this.categoryModel.create({ userId, name: to });
    }

    return this.summaryFor(userId, to);
  }

  /**
   * Só apaga categoria que não está em uso. Apagar uma em uso deixaria compras
   * apontando para um nome que sumiu da lista — o estado que a tela não sabe
   * mostrar. Para esvaziar uma categoria, mescle-a em outra.
   */
  async deleteCategory(userId: Types.ObjectId, name: string): Promise<void> {
    const purchases = await this.purchaseModel.countDocuments({ userId, category: name }).exec();
    if (purchases > 0) {
      throw new ConflictException(
        `"${name}" tem ${purchases} compras. Renomeie-a para outra categoria em vez de apagar.`,
      );
    }

    const rules = await this.ruleModel.countDocuments({ userId, category: name }).exec();
    if (rules > 0) {
      throw new ConflictException(`"${name}" ainda é destino de ${rules} regras.`);
    }

    const result = await this.categoryModel.deleteOne({ userId, name }).exec();
    if (result.deletedCount === 0)
      throw new NotFoundException(`Categoria "${name}" não encontrada.`);
  }

  listRules(userId: Types.ObjectId): Promise<CategoryRuleDocument[]> {
    return this.ruleModel.find({ userId }).sort({ updatedAt: -1 }).exec();
  }

  /**
   * Os títulos distintos da base, com a categoria e o volume de cada um.
   *
   * A categoria vem do par (título, categoria) mais numeroso, e não de um
   * `$first`: a ordem dentro de um grupo do Mongo não é definida, e um título
   * que apareça em duas categorias devolveria uma ou outra conforme o dia.
   */
  private async titleRows(userId: Types.ObjectId): Promise<TitleRow[]> {
    const rows = await this.purchaseModel
      .aggregate<{ _id: string; category: string; purchases: number }>([
        { $match: { userId, sourceCategory: { $ne: PAYMENT_CATEGORY } } },
        { $group: { _id: { title: '$title', category: '$category' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        {
          $group: {
            _id: '$_id.title',
            category: { $first: '$_id.category' },
            purchases: { $sum: '$n' },
          },
        },
      ])
      .exec();

    return rows.map(({ _id, category, purchases }) => ({ title: _id, category, purchases }));
  }

  /**
   * As regras com quantas compras cada uma governa.
   *
   * Sem esse número a lista de 255 regras é ilegível: não dá para saber qual
   * carrega a base e qual sobrou de uma classificação isolada de 2019, nem o
   * que se perde ao apagar uma.
   */
  async listRuleUsage(userId: Types.ObjectId): Promise<RuleUsage[]> {
    const [rules, titles] = await Promise.all([this.listRules(userId), this.titleRows(userId)]);

    const byRule = new Map<string, { purchases: number; titles: number }>();
    for (const { title, purchases } of titles) {
      const winner = ruleForTitle(title, rules);
      if (!winner) continue;
      const id = String(winner._id);
      const tally = byRule.get(id) ?? { purchases: 0, titles: 0 };
      tally.purchases += purchases;
      tally.titles += 1;
      byRule.set(id, tally);
    }

    return rules.map((rule) => {
      const tally = byRule.get(String(rule._id)) ?? { purchases: 0, titles: 0 };
      return {
        _id: String(rule._id),
        kind: rule.kind,
        value: rule.value,
        category: rule.category,
        updatedAt: rule.updatedAt,
        ...tally,
      };
    });
  }

  /**
   * Onde um punhado de regras `exact` poderia virar uma `contains`.
   *
   * Devolve também as bloqueadas, com o que elas levariam junto — nesta base é
   * a informação mais útil da análise, porque as maiores alavancas são
   * justamente as que têm conflito.
   *
   * As descartadas vêm junto, marcadas. Filtrá-las aqui deixaria a tela sem como
   * dizer que existem nem como desfazer o descarte — e uma decisão que não dá
   * para rever é pior que o incômodo que ela resolve.
   */
  async listConsolidations(userId: Types.ObjectId): Promise<ConsolidationSuggestionView[]> {
    const [rules, titles, dismissed] = await Promise.all([
      this.listRules(userId),
      this.titleRows(userId),
      this.dismissalModel.find({ userId }).exec(),
    ]);

    const hidden = new Set(dismissed.map(({ category, value }) => dismissalKey(category, value)));

    return suggestConsolidations(rules, titles).map((suggestion) => ({
      ...suggestion,
      dismissed: hidden.has(dismissalKey(suggestion.category, suggestion.value)),
    }));
  }

  /**
   * Esconde uma sugestão que o usuário julgou que não vale a pena.
   *
   * Guarda o par (categoria, trecho), e não um id: a sugestão não é documento —
   * ela é recalculada a cada requisição a partir das regras e das compras. O par
   * é o que sobrevive à próxima fatura mudar os números dela.
   *
   * O descarte não impede consolidar depois: some da lista, não da API.
   */
  async dismissConsolidation(
    userId: Types.ObjectId,
    { category, value }: DismissConsolidationDto,
  ): Promise<void> {
    await this.dismissalModel
      .updateOne(
        { userId, category, value },
        { $setOnInsert: { userId, category, value } },
        { upsert: true },
      )
      .exec();
  }

  /** Devolve a sugestão à lista. Descartar o que não devia é barato de desfazer. */
  async restoreConsolidation(
    userId: Types.ObjectId,
    { category, value }: DismissConsolidationDto,
  ): Promise<void> {
    await this.dismissalModel.deleteOne({ userId, category, value }).exec();
  }

  /**
   * Cria ou atualiza a regra e reescreve a base na sequência.
   *
   * Reclassificar o mesmo título edita a regra que existe em vez de empilhar uma
   * segunda: duas regras para o mesmo valor só se contradiriam, e o desempate
   * por data faria a antiga virar lixo silencioso. A comparação é normalizada
   * porque o emissor alterna a caixa do mesmo estabelecimento entre os meses.
   */
  async upsertRule(
    userId: Types.ObjectId,
    dto: CreateRuleDto,
  ): Promise<{ rule: CategoryRuleDocument } & ReapplyResult> {
    const value = dto.value.trim();
    const category = dto.category.trim();

    if (value === '') throw new ConflictException('A regra precisa de um título ou trecho.');
    if (isReservedCategory(category)) {
      throw new ConflictException(
        `"${category}" é o pagamento da fatura: uma regra apontando para lá somaria a fatura ao gasto.`,
      );
    }

    const existing = (await this.ruleModel.find({ userId, kind: dto.kind }).exec()).find(
      (rule) => normalize(rule.value) === normalize(value),
    );

    const rule = existing
      ? await this.ruleModel
          .findByIdAndUpdate(existing._id, { $set: { value, category } }, { new: true })
          .exec()
      : await this.ruleModel.create({ userId, kind: dto.kind, value, category });

    // Uma categoria usada por uma regra passa a existir na lista mesmo antes de
    // qualquer compra cair nela — senão ela sumiria do seletor até a reaplicação.
    if (!(await this.categoryModel.exists({ userId, name: category }))) {
      await this.categoryModel.create({ userId, name: category });
    }

    return { rule, ...(await this.reapply(userId)) };
  }

  /**
   * Muda o trecho ou o tipo de uma regra que já existe, mantendo o `_id`.
   *
   * `upsertRule` não serve para isto: ele acha a regra pelo par `(kind, value)`,
   * então mandar um `value` novo não editaria a antiga — criaria uma segunda e
   * deixaria a primeira órfã, presa ao título que ninguém mais quer. Esta rota
   * localiza pelo `_id`, que não muda quando o conteúdo muda.
   *
   * As compras que a forma antiga da regra governava não ficam soltas: a
   * reaplicação no fim já resolve isso — exatamente como resolve quando uma
   * regra é apagada. Uma compra que a nova forma não alcança mais volta para
   * `sourceCategory` ou passa a obedecer outra regra que já existia, a mesma
   * escada de sempre.
   */
  async editRule(
    userId: Types.ObjectId,
    id: string,
    dto: CreateRuleDto,
  ): Promise<{ rule: CategoryRuleDocument } & ReapplyResult> {
    const value = dto.value.trim();
    const category = dto.category.trim();

    if (value === '') throw new ConflictException('A regra precisa de um título ou trecho.');
    if (isReservedCategory(category)) {
      throw new ConflictException(
        `"${category}" é o pagamento da fatura: uma regra apontando para lá somaria a fatura ao gasto.`,
      );
    }

    // `findOne({ _id, userId })`, e não `findById`: com o id na URL, buscar só
    // pelo `_id` deixaria um usuário editar a regra de outro digitando o id
    // certo — e a resposta seria 200, não 404.
    const current = await this.ruleModel.findOne({ _id: id, userId }).exec();
    if (!current) throw new NotFoundException('Regra não encontrada.');

    // Duas regras para o mesmo par `(kind, value)` só se contradiriam — o mesmo
    // motivo que faz `upsertRule` editar em vez de duplicar. Aqui, como o `_id`
    // já está fixado numa regra diferente, a saída é recusar em vez de escolher
    // qual das duas prevalece.
    const collision = (
      await this.ruleModel.find({ userId, kind: dto.kind, _id: { $ne: id } }).exec()
    ).find((rule) => normalize(rule.value) === normalize(value));
    if (collision) {
      throw new ConflictException(
        `Já existe uma regra ${dto.kind === 'exact' ? 'exata' : 'por trecho'} para "${value}".`,
      );
    }

    const rule = await this.ruleModel
      .findOneAndUpdate(
        { _id: id, userId },
        { $set: { kind: dto.kind, value, category } },
        { new: true },
      )
      .exec();
    if (!rule) throw new NotFoundException('Regra não encontrada.');

    if (!(await this.categoryModel.exists({ userId, name: category }))) {
      await this.categoryModel.create({ userId, name: category });
    }

    return { rule, ...(await this.reapply(userId)) };
  }

  /**
   * Troca as regras `exact` cobertas pelo trecho por uma `contains` só.
   *
   * Existe como operação própria por causa do custo: fazer isso pela API de
   * regras seria um `POST` e cinquenta `DELETE`, e **cada um reaplica a base
   * inteira**. Cinquenta e uma varreduras para uma mudança que é uma.
   *
   * Quem decide o que morre é o servidor, não o cliente: a lista de substituídas
   * é recalculada aqui a partir do trecho. Uma tela desatualizada — a sugestão
   * foi carregada, o usuário classificou outra coisa em outra aba — apagaria a
   * regra errada se mandasse ids.
   *
   * A recusa por conflito **não** é repetida aqui de propósito. Consolidar é uma
   * decisão informada: a tela mostra o que o trecho levaria junto, e quem manda
   * aplicar mesmo assim está dizendo que aquilo é o que quer. O que não se pode
   * é fazer isso em silêncio.
   *
   * `exceptions` é o meio-termo entre aplicar mesmo assim e não aplicar: cada
   * título vira regra `exact` na categoria de agora **antes** de o trecho
   * entrar, e `exact` sempre ganha de `contains` na escada de precedência — é
   * o que mantém a exceção onde estava, mesmo com o trecho passando a alcançá-
   * la. Um conflito de 1 ou 2 títulos deixa de exigir abrir mão do resto da
   * consolidação.
   */
  async consolidate(
    userId: Types.ObjectId,
    { value, category, exceptions = [] }: ConsolidateDto,
  ): Promise<{ created: number; deleted: number; exceptions: number } & ReapplyResult> {
    const trecho = value.trim();
    if (trecho === '') throw new ConflictException('O trecho não pode ser vazio.');
    if (isReservedCategory(category)) {
      throw new ConflictException(`"${category}" é o pagamento da fatura, não uma categoria.`);
    }

    const covered = (await this.ruleModel.find({ userId, kind: 'exact', category }).exec()).filter(
      (rule) => normalize(rule.value).includes(normalize(trecho)),
    );

    // Upsert, e não `create`: o título já não tem regra `exact` própria — é
    // exatamente por isso que apareceu como conflito —, mas o upsert é a
    // mesma cautela do resto do serviço contra um cliente com dado velho.
    if (exceptions.length > 0) {
      await this.ruleModel.bulkWrite(
        exceptions.map(({ title, category: exceptionCategory }) => ({
          updateOne: {
            filter: { userId, kind: 'exact', value: title },
            update: {
              $setOnInsert: { userId, kind: 'exact', value: title, category: exceptionCategory },
            },
            upsert: true,
          },
        })),
      );
    }

    await this.ruleModel
      .updateOne(
        { userId, kind: 'contains', value: trecho },
        { $set: { userId, kind: 'contains', value: trecho, category } },
        { upsert: true },
      )
      .exec();

    if (covered.length > 0) {
      await this.ruleModel
        .deleteMany({ userId, _id: { $in: covered.map((rule) => rule._id) } })
        .exec();
    }

    return {
      created: 1,
      deleted: covered.length,
      exceptions: exceptions.length,
      ...(await this.reapply(userId)),
    };
  }

  async deleteRule(userId: Types.ObjectId, id: string): Promise<ReapplyResult> {
    // Pelo par, e não por `findByIdAndDelete`: um id de outro usuário tem de
    // dar 404, e não apagar a regra dele.
    const result = await this.ruleModel.findOneAndDelete({ _id: id, userId }).exec();
    if (!result) throw new NotFoundException('Regra não encontrada.');
    return this.reapply(userId);
  }

  /**
   * Reescreve a categoria de toda a base a partir das regras de agora.
   *
   * Roda inteiro a cada mudança em vez de calcular o delta. Numa base pessoal
   * são alguns milhares de compras e uma escrita por categoria envolvida, o que
   * some no tempo da requisição — e em troca a operação é idempotente, o que
   * significa que ela pode rodar de novo depois de um `pnpm extract` sem que a
   * ordem das duas importe.
   */
  reapply(userId: Types.ObjectId): Promise<ReapplyResult> {
    return this.listRules(userId).then((rules) =>
      reapplyRules(createPurchaseStore(this.purchaseModel, userId), rules),
    );
  }

  private async findCategoryByName(
    userId: Types.ObjectId,
    name: string,
  ): Promise<string | undefined> {
    const known = await this.listCategories(userId);
    return known.find((category) => normalize(category.name) === normalize(name))?.name;
  }

  private async summaryFor(userId: Types.ObjectId, name: string): Promise<CategorySummary> {
    const purchaseCount = await this.purchaseModel
      .countDocuments({ userId, category: name })
      .exec();
    return { name, purchaseCount };
  }
}
