-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "chainAgentId" INTEGER,
    "ownerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadataURI" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "chainVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastScoreTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "payload" JSONB,
    "ts" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VectorSnapshot" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "execution" INTEGER NOT NULL,
    "reliability" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "collaboration" INTEGER NOT NULL,
    "composite" INTEGER NOT NULL,
    "proofHash" TEXT,
    "txHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VectorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_chainAgentId_key" ON "Agent"("chainAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_idempotencyKey_key" ON "Event"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Event_agentId_ts_idx" ON "Event"("agentId", "ts");

-- CreateIndex
CREATE INDEX "VectorSnapshot_agentId_updatedAt_idx" ON "VectorSnapshot"("agentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proof_hash_key" ON "Proof"("hash");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VectorSnapshot" ADD CONSTRAINT "VectorSnapshot_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
