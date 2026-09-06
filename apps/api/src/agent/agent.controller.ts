import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { Address } from "viem";
import { AgentService } from "./agent.service.js";

@Controller("agents")
export class AgentController {
  constructor(private readonly agents: AgentService) {}

  /**
   * Path 1：注册 Agent。
   * ownerAddress+ownerPrivateKey 必须一致（mint 账户 = NFT owner = 事件验签信任锚）。
   * dev/本地用 hardhat account#1（=EVALUATOR）注册即可。
   */
  @Post()
  register(
    @Body()
    body: {
      name: string;
      metadataURI?: string;
      ownerAddress?: string;
      ownerPrivateKey?: string;
    },
  ) {
    return this.agents.register({
      name: body.name,
      metadataURI: body.metadataURI,
      ownerAddress: body.ownerAddress as Address | undefined,
      ownerPrivateKey: body.ownerPrivateKey,
    });
  }

  /** Dashboard：Agent 列表（含最新声誉快照 + 链上验证状态），倒序 */
  @Get()
  list() {
    return this.agents.list();
  }

  /** SDK initialize() 调用点 */
  @Get(":agentId/snapshot")
  snapshot(@Param("agentId") agentId: string) {
    return this.agents.snapshot(agentId);
  }
}
