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
}
