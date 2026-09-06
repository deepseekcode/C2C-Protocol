import { Module } from "@nestjs/common";
import { TaskService } from "./task.service.js";
import { TaskController } from "./task.controller.js";
import { AttestationModule } from "../attestation/attestation.module.js";

@Module({
  imports: [AttestationModule],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
