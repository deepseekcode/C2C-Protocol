import { Controller, Get, Param } from "@nestjs/common";
import { ReputationService } from "./reputation.service.js";

@Controller("reputation")
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  /** SDK reputation.get() 调用点 */
  @Get(":agentId")
  get(@Param("agentId") agentId: string) {
    return this.reputation.get(agentId);
  }

  /** Path 3 Proof 验证：DB 原文重算 keccak256 ↔ 链上 ReputationRegistry.proofHash */
  @Get("verify/:agentId")
  verify(@Param("agentId") agentId: string) {
    return this.reputation.verifyAgainstChain(agentId);
  }
}
