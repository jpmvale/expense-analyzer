import { Module } from '@nestjs/common';
import { PurchaseController, SubscriptionController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Purchase, PurchaseSchema } from '../schemas/purchase.schema';
import { Subscription, SubscriptionSchema } from '../schemas/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [PurchaseController, SubscriptionController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
