import { Module } from "@nestjs/common";
import { ProofService } from "./proof.service.js";

@Module({
  providers: [ProofService],
  exports: [ProofService],
})
export class ProofModule {}
