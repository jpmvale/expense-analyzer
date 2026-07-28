import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../schemas/category.schema';
import { CategoryRule, CategoryRuleSchema } from '../schemas/category-rule.schema';
import {
  ConsolidationDismissal,
  ConsolidationDismissalSchema,
} from '../schemas/consolidation-dismissal.schema';
import { Purchase, PurchaseSchema } from '../schemas/purchase.schema';
import { CategoryController, CategoryRuleController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Category.name, schema: CategorySchema },
      { name: CategoryRule.name, schema: CategoryRuleSchema },
      { name: ConsolidationDismissal.name, schema: ConsolidationDismissalSchema },
    ]),
  ],
  controllers: [CategoryController, CategoryRuleController],
  providers: [CategoryService],
})
export class CategoryModule {}
