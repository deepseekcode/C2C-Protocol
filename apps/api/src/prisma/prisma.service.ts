import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "../config/env.js";

/**
 * 全局唯一 PrismaClient。连接串显式来自 env.ts（根 .env 的 DATABASE_URL）。
 * e2e 测试可覆盖 process.env.DATABASE_URL（连测试库）。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: { db: { url: process.env.DATABASE_URL ?? DATABASE_URL } },
    });
  }
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
