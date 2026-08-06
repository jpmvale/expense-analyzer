import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoryRule, CategoryRuleSchema } from '../schemas/category-rule.schema';
import { Purchase, PurchaseSchema } from '../schemas/purchase.schema';
import { SyncRun, SyncRunSchema } from '../schemas/sync-run.schema';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: CategoryRule.name, schema: CategoryRuleSchema },
      { name: SyncRun.name, schema: SyncRunSchema },
    ]),
  ],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
