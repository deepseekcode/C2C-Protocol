import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampScore,
  compositeScore,
  emaUpdate,
  initialVector,
  isUnranked,
  normalizeVector,
  toLevel,
  updateVector,
  VECTOR_WEIGHTS,
} from "../src/index.js";

test("clampScore 钳制到 [0,10000]", () => {
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore(10001), 10000);
  assert.equal(clampScore(9500.4), 9500);
  assert.equal(clampScore(NaN), 0);
});

test("权重总和为 100", () => {
  const sum = Object.values(VECTOR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test("compositeScore 加权计算正确", () => {
  // 820*0.3 + 910*0.3 + 760*0.25 + 880*0.15 = 246+273+190+132 = 841
  const s = compositeScore({ execution: 820, reliability: 910, quality: 760, collaboration: 880 });
  assert.equal(s, 841);
});

test("compositeScore 满分/零分边界", () => {
  assert.equal(compositeScore({ execution: 10000, reliability: 10000, quality: 10000, collaboration: 10000 }), 10000);
  assert.equal(compositeScore({ execution: 0, reliability: 0, quality: 0, collaboration: 0 }), 0);
});

test("normalizeVector 越界分量被钳制", () => {
  const n = normalizeVector({ execution: 12000, reliability: -1, quality: 5000, collaboration: 5000 });
  assert.deepEqual(n, { execution: 10000, reliability: 0, quality: 5000, collaboration: 5000 });
});

test("toLevel 阈值正确", () => {
  assert.equal(toLevel(9500), "Diamond");
  assert.equal(toLevel(9000), "Diamond");
  assert.equal(toLevel(8600), "Platinum");
  assert.equal(toLevel(7000), "Gold");
  assert.equal(toLevel(5000), "Silver");
  assert.equal(toLevel(3000), "Bronze");
  assert.equal(toLevel(100), "Bronze");
  assert.equal(isUnranked(2999), true);
  assert.equal(isUnranked(3000), false);
});

test("emaUpdate 指数滑动平均", () => {
  // 5000*0.7 + 10000*0.3 = 6500
  assert.equal(emaUpdate(5000, 10000, 0.3), 6500);
  // alpha 越界被钳制
  assert.equal(emaUpdate(5000, 10000, 2), 10000);
});

test("updateVector 完成任务提升 execution/reliability", () => {
  const v0 = initialVector();
  const v1 = updateVector(v0, { completed: true, qualitySelfReport: 0.9, durationMs: 60_000 });
  assert.ok(v1.execution > v0.execution);
  assert.ok(v1.reliability > v0.reliability);
  assert.ok(v1.quality > v0.quality);
});

test("updateVector 失败任务拉低 execution/reliability", () => {
  const v0 = initialVector();
  const v1 = updateVector(v0, { completed: false });
  assert.ok(v1.execution < v0.execution);
  assert.ok(v1.reliability < v0.reliability);
});

test("updateVector 响应越慢 collaboration 越低", () => {
  const v0 = initialVector();
  const fast = updateVector(v0, { completed: true, durationMs: 30_000 });
  const slow = updateVector(v0, { completed: true, durationMs: 3_600_000 });
  assert.ok(fast.collaboration > slow.collaboration);
});
