import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ChainModule } from "./chain/chain.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { EventModule } from "./event/event.module.js";
import { ReputationModule } from "./reputation/reputation.module.js";
import { ProofModule } from "./proof/proof.module.js";
import { AttestationModule } from "./attestation/attestation.module.js";
import { IndexerModule } from "./indexer/indexer.module.js";
import { TaskModule } from "./task/task.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [
    PrismaModule,
    ChainModule,
    ProofModule,
    AttestationModule,
    AgentModule,
    EventModule,
    ReputationModule,
    IndexerModule,
    TaskModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
