import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { EventService } from "./event.service.js";
import type { C2CEventEnvelope } from "@c2c/agent-sdk";

@Controller("events")
export class EventController {
  constructor(private readonly events: EventService) {}

  /** L0 事件入口（SDK track/submitEnvelope 的落点） */
  @Post()
  @HttpCode(200)
  ingest(@Body() env: C2CEventEnvelope) {
    return this.events.ingest(env);
  }
}
