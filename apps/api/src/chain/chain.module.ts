import { Global, Module } from "@nestjs/common";

/** chain 模块无状态（viem client 工厂按需创建），Global 导出以便各服务注入函数。 */
@Global()
@Module({})
export class ChainModule {}
