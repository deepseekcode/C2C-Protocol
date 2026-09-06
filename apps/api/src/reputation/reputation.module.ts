import { Module } from "@nestjs/common";
import { ReputationService } from "./reputation.service.js";
import { ReputationController } from "./reputation.controller.js";
import { AttestationModule } from "../attestation/attestation.module.js";

@Module({
  imports: [AttestationModule],
  providers: [ReputationService],
  controllers: [ReputationController],
  exports: [ReputationService],
})
export class ReputationModule {}
