import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { publicClient } from "../chain/client.js";
import { IPFS_API_URL } from "../config/env.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let db = false;
    let chain = false;
    let ipfs = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      /* db down */
    }
    try {
      await publicClient().getBlockNumber();
      chain = true;
    } catch {
      /* chain down */
    }
    try {
      const res = await fetch(`${IPFS_API_URL}/api/v0/version`, { method: "POST" });
      ipfs = res.ok;
    } catch {
      /* ipfs down */
    }
    return { ok: db && chain, db, chain, ipfs };
  }
}
