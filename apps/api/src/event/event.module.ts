import { Module } from "@nestjs/common";
import { EventService } from "./event.service.js";
import { EventController } from "./event.controller.js";
import { ProofModule } from "../proof/proof.module.js";
import { AttestationModule } from "../attestation/attestation.module.js";

@Module({
  imports: [ProofModule, AttestationModule],
  providers: [EventService],
  controllers: [EventController],
  exports: [EventService],
})
export class EventModule {}
