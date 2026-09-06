// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title TaskRegistry
 * @notice C2C Protocol — 任务登记表（链上审计登记，不做撮合/支付）。
 *
 * 职责边界（与 V1 红线一致）：
 *  - 链上只登记「谁发布 / 谁领取 / 何时完成」的可审计状态，供第三方复核；
 *  - 声誉门槛（minScore）由链下 API 读取 ReputationRegistry.compositeScore 校验通过后
 *    才调用 assignTask —— 合约不读分数、不裁决，避免引入链上预言机/权限复杂度；
 *  - 不涉及代币支付 / Reward 结算 / 竞价撮合（V1 明确不做）。
 *
 * taskHash = keccak256(abi.encodePacked(chainId, publisher, externalId, minScore))
 * 由服务端计算（externalId 为发布者业务 ID，唯一可重算），合约仅作登记键。
 *
 * 状态机：TaskPublished → TaskAssigned（一次）→ TaskCompleted。
 */
contract TaskRegistry {
    struct TaskRecord {
        bytes32 taskHash;
        address publisher;    // 发布者地址
        uint256 minScore;     // 声誉门槛 0–10000（0 = 无门槛；链下校验用）
        uint256 agentId;      // 领取的 Agent（未领取 = 0）
        bool assigned;        // 是否已被领取
        bool completed;       // 是否已完成
        uint64 createdAt;
        uint64 assignedAt;
        uint64 completedAt;
    }

    uint256 private _taskCount;
    mapping(bytes32 => TaskRecord) private _tasks;

    event TaskPublished(bytes32 indexed taskHash, address indexed publisher, uint256 minScore);
    event TaskAssigned(bytes32 indexed taskHash, uint256 indexed agentId, address assigner);
    event TaskCompleted(bytes32 indexed taskHash);

    modifier onlyPublisher(bytes32 taskHash) {
        require(_tasks[taskHash].publisher == msg.sender, "TaskRegistry: not publisher");
        _;
    }

    /// @notice 发布任务：登记 taskHash 与发布者、门槛。taskHash 不可重复发布。
    function publishTask(bytes32 taskHash, uint256 minScore, uint64 /* deadline */) external {
        require(taskHash != bytes32(0), "TaskRegistry: empty taskHash");
        require(_tasks[taskHash].createdAt == 0, "TaskRegistry: already published");
        require(minScore <= 10000, "TaskRegistry: minScore out of range");

        _tasks[taskHash] = TaskRecord({
            taskHash: taskHash,
            publisher: msg.sender,
            minScore: minScore,
            agentId: 0,
            assigned: false,
            completed: false,
            createdAt: uint64(block.timestamp),
            assignedAt: 0,
            completedAt: 0
        });
        _taskCount++;
        emit TaskPublished(taskHash, msg.sender, minScore);
    }

    /// @notice Agent 领取任务。调用方 = Agent owner（API 已验签 + 校验过门槛）。
    ///         可被任意账户调用（无权限门槛）——链上不校验门槛，仅登记领取事实；
    ///         但一个任务只能被领取一次。
    function assignTask(bytes32 taskHash, uint256 agentId) external {
        TaskRecord storage t = _tasks[taskHash];
        require(t.createdAt != 0, "TaskRegistry: not published");
        require(!t.assigned, "TaskRegistry: already assigned");
        require(agentId != 0, "TaskRegistry: empty agentId");

        t.assigned = true;
        t.agentId = agentId;
        t.assignedAt = uint64(block.timestamp);
        emit TaskAssigned(taskHash, agentId, msg.sender);
    }

    /// @notice 标记完成。仅发布者调用（发布者验收后登记完成）。
    function completeTask(bytes32 taskHash) external onlyPublisher(taskHash) {
        TaskRecord storage t = _tasks[taskHash];
        require(t.createdAt != 0, "TaskRegistry: not published");
        require(t.assigned, "TaskRegistry: not assigned");
        require(!t.completed, "TaskRegistry: already completed");

        t.completed = true;
        t.completedAt = uint64(block.timestamp);
        emit TaskCompleted(taskHash);
    }

    function getTask(bytes32 taskHash) external view returns (TaskRecord memory) {
        return _tasks[taskHash];
    }

    /// @notice 已发布任务总数（链上可审计指标）
    function totalTasks() external view returns (uint256) {
        return _taskCount;
    }
}
