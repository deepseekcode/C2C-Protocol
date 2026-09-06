import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { TaskService, type PublishTaskInput, type ClaimTaskInput } from "./task.service.js";

@Controller("tasks")
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  /** 发布任务（人 → 链下状态机 + TaskRegistry 链上登记） */
  @Post()
  publish(@Body() body: PublishTaskInput) {
    return this.tasks.publish(body);
  }

  /** 任务市场列表（默认全部；?status=OPEN 过滤） */
  @Get()
  list(@Query("status") status?: string) {
    return this.tasks.list(status);
  }

  /** 单任务详情（externalId） */
  @Get(":externalId")
  get(@Param("externalId") externalId: string) {
    return this.tasks.get(externalId);
  }

  /** Agent 领取任务（校验链上声誉 ≥ 门槛 → 上链登记） */
  @Post(":externalId/claim")
  claim(@Param("externalId") externalId: string, @Body() body: ClaimTaskInput) {
    return this.tasks.claim(externalId, body);
  }

  /** 完成（发布者确认） */
  @Post(":externalId/complete")
  complete(
    @Param("externalId") externalId: string,
    @Body() body: { publisherPrivateKey?: string },
  ) {
    return this.tasks.complete(externalId, body.publisherPrivateKey);
  }

  /** 取消（仅 OPEN，发布者） */
  @Post(":externalId/cancel")
  cancel(@Param("externalId") externalId: string, @Body() body: { publisherPrivateKey: string }) {
    return this.tasks.cancel(externalId, body.publisherPrivateKey);
  }
}
