import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";
import { AppModule } from "./app.module.js";
import { API_PORT } from "./config/env.js";

/** 全局异常过滤器：未捕获异常打印堆栈（dev 排障必需），响应保持标准 JSON */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) this.logger.error(`HTTP ${status}: ${exception.message}`, exception.stack);
      res.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
      return;
    }
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`Unhandled: ${message}`, stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(API_PORT);
  // eslint-disable-next-line no-console
  console.log(`[api] C2C API listening on http://127.0.0.1:${API_PORT}`);
}

void bootstrap();
