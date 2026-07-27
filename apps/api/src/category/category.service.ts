import {
  isReservedCategory,
  normalize,
  PAYMENT_CATEGORY,
  reapplyRules,
  type ReapplyResult,
} from '@expense/categorization';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { CategoryRule, CategoryRuleDocument } from '../schemas/category-rule.schema';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { CreateCategoryDto, CreateRuleDto, RenameCategoryDto } from './dto/category.dto';
import { createPurchaseStore } from './purchase-store';

export interface CategorySummary {
  name: string;
  /** Quantas compras estão nela hoje. Zero é categoria criada e ainda não usada. */
  purchaseCount: number;
}

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(CategoryRule.name) private readonly ruleModel: Model<CategoryRuleDocument>,
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
  async listCategories(): Promise<CategorySummary[]> {
    const [counts, created] = await Promise.all([
      this.purchaseModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { category: { $ne: PAYMENT_CATEGORY } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ])
        .exec(),
      this.categoryModel.find().exec(),
    ]);

    const byName = new Map<string, number>(counts.map(({ _id, count }) => [_id, count]));
    for (const { name } of created) {
      if (!byName.has(name)) byName.set(name, 0);
    }

    return [...byName]
      .map(([name, purchaseCount]) => ({ name, purchaseCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async createCategory({ name }: CreateCategoryDto): Promise<CategorySummary> {
    const clean = name.trim();
    if (clean === '') throw new ConflictException('A categoria precisa de um nome.');
    if (isReservedCategory(clean)) {
      throw new ConflictException(`"${clean}" é o pagamento da fatura, não uma categoria de gasto.`);
    }

    const existing = await this.findCategoryByName(clean);
    if (existing) throw new ConflictException(`A categoria "${existing}" já existe.`);

    await this.categoryModel.create({ name: clean });
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
  async renameCategory(from: string, { name }: RenameCategoryDto): Promise<CategorySummary> {
    const to = name.trim();
    if (to === '') throw new ConflictException('A categoria precisa de um nome.');
    if (isReservedCategory(from) || isReservedCategory(to)) {
      throw new ConflictException('O pagamento da fatura não é uma categoria renomeável.');
    }
    // Só o nome idêntico é no-op. Trocar apenas a caixa — "casa" para "Casa" —
    // é uma renomeação de verdade, e comparar normalizado a engoliria em
    // silêncio, deixando a tela mostrando o nome antigo.
    if (from === to) return this.summaryFor(to);

    const known = await this.listCategories();
    if (!known.some((category) => category.name === from)) {
      throw new NotFoundException(`Categoria "${from}" não encontrada.`);
    }

    await Promise.all([
      this.purchaseModel.updateMany({ category: from }, { $set: { category: to } }).exec(),
      this.purchaseModel
        .updateMany({ sourceCategory: from }, { $set: { sourceCategory: to } })
        .exec(),
      this.ruleModel.updateMany({ category: from }, { $set: { category: to } }).exec(),
    ]);

    // Some com o registro antigo. Numa mescla o destino já existe (ou existe só
    // nas compras), então o novo é criado apenas se ninguém o representa ainda.
    await this.categoryModel.deleteOne({ name: from }).exec();
    if (!(await this.categoryModel.exists({ name: to }))) {
      await this.categoryModel.create({ name: to });
    }

    return this.summaryFor(to);
  }

  /**
   * Só apaga categoria que não está em uso. Apagar uma em uso deixaria compras
   * apontando para um nome que sumiu da lista — o estado que a tela não sabe
   * mostrar. Para esvaziar uma categoria, mescle-a em outra.
   */
  async deleteCategory(name: string): Promise<void> {
    const purchases = await this.purchaseModel.countDocuments({ category: name }).exec();
    if (purchases > 0) {
      throw new ConflictException(
        `"${name}" tem ${purchases} compras. Renomeie-a para outra categoria em vez de apagar.`,
      );
    }

    const rules = await this.ruleModel.countDocuments({ category: name }).exec();
    if (rules > 0) {
      throw new ConflictException(`"${name}" ainda é destino de ${rules} regras.`);
    }

    const result = await this.categoryModel.deleteOne({ name }).exec();
    if (result.deletedCount === 0) throw new NotFoundException(`Categoria "${name}" não encontrada.`);
  }

  listRules(): Promise<CategoryRuleDocument[]> {
    return this.ruleModel.find().sort({ updatedAt: -1 }).exec();
  }

  /**
   * Cria ou atualiza a regra e reescreve a base na sequência.
   *
   * Reclassificar o mesmo título edita a regra que existe em vez de empilhar uma
   * segunda: duas regras para o mesmo valor só se contradiriam, e o desempate
   * por data faria a antiga virar lixo silencioso. A comparação é normalizada
   * porque o emissor alterna a caixa do mesmo estabelecimento entre os meses.
   */
  async upsertRule(dto: CreateRuleDto): Promise<{ rule: CategoryRuleDocument } & ReapplyResult> {
    const value = dto.value.trim();
    const category = dto.category.trim();

    if (value === '') throw new ConflictException('A regra precisa de um título ou trecho.');
    if (isReservedCategory(category)) {
      throw new ConflictException(
        `"${category}" é o pagamento da fatura: uma regra apontando para lá somaria a fatura ao gasto.`,
      );
    }

    const existing = (await this.ruleModel.find({ kind: dto.kind }).exec()).find(
      (rule) => normalize(rule.value) === normalize(value),
    );

    const rule = existing
      ? await this.ruleModel
          .findByIdAndUpdate(existing._id, { $set: { value, category } }, { new: true })
          .exec()
      : await this.ruleModel.create({ kind: dto.kind, value, category });

    // Uma categoria usada por uma regra passa a existir na lista mesmo antes de
    // qualquer compra cair nela — senão ela sumiria do seletor até a reaplicação.
    if (!(await this.categoryModel.exists({ name: category }))) {
      await this.categoryModel.create({ name: category });
    }

    return { rule, ...(await this.reapply()) };
  }

  async deleteRule(id: string): Promise<ReapplyResult> {
    const result = await this.ruleModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Regra não encontrada.');
    return this.reapply();
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
  reapply(): Promise<ReapplyResult> {
    return this.listRules().then((rules) =>
      reapplyRules(createPurchaseStore(this.purchaseModel), rules),
    );
  }

  private async findCategoryByName(name: string): Promise<string | undefined> {
    const known = await this.listCategories();
    return known.find((category) => normalize(category.name) === normalize(name))?.name;
  }

  private async summaryFor(name: string): Promise<CategorySummary> {
    const purchaseCount = await this.purchaseModel.countDocuments({ category: name }).exec();
    return { name, purchaseCount };
  }
}
