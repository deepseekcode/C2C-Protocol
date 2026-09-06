// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ReputationRegistry
 * @notice C2C Protocol — 声誉向量（Reputation Vector）链上状态 + EIP-712 签名验证。
 *
 * 信任模型：后端不直接改分，而是签发 ScoreAttestation（EIP-712 typed data）。
 * 任何人可携带签名调用 submitScore，合约只做密码学验签（EVALUATOR_ROLE）+
 * per-agent nonce 防重放 + deadline 防过期。信任根是签名密钥，不是 API 服务器。
 *
 * Vector 四维（各 0–10000）与权重：execution 30 / reliability 30 / quality 25 / collaboration 15。
 */
contract ReputationRegistry is EIP712, AccessControl {
    using ECDSA for bytes32;

    bytes32 public constant EVALUATOR_ROLE = keccak256("EVALUATOR_ROLE");

    uint32 public constant WEIGHT_EXECUTION = 30;
    uint32 public constant WEIGHT_RELIABILITY = 30;
    uint32 public constant WEIGHT_QUALITY = 25;
    uint32 public constant WEIGHT_COLLABORATION = 15;

    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256(
            "ScoreAttestation(uint256 agentId,uint32 execution,uint32 reliability,uint32 quality,uint32 collaboration,uint256 tasksCompleted,bytes32 proofHash,uint256 nonce,uint64 deadline)"
        );

    struct ScoreAttestation {
        uint256 agentId;
        uint32 execution;
        uint32 reliability;
        uint32 quality;
        uint32 collaboration;
        uint256 tasksCompleted;
        bytes32 proofHash; // keccak256(IPFS proof JSON)
        uint256 nonce;     // per-agent 防重放
        uint64 deadline;
    }

    struct ReputationVector {
        uint32 execution;
        uint32 reliability;
        uint32 quality;
        uint32 collaboration;
        uint256 tasksCompleted;
        bytes32 proofHash;
        uint256 updatedAt;
    }

    mapping(uint256 => ReputationVector) public agentReputation;
    mapping(uint256 => uint256) public nonces;

    event ScoreUpdated(
        uint256 indexed agentId,
        uint32 execution,
        uint32 reliability,
        uint32 quality,
        uint32 collaboration,
        uint256 composite,
        bytes32 proofHash
    );

    constructor() EIP712("C2C ReputationRegistry", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice 提交经评估方签名的声誉向量。任何人均可调用（gas 可由用户自付）。
    function submitScore(ScoreAttestation calldata att, bytes calldata sig) external {
        require(block.timestamp <= att.deadline, "ReputationRegistry: attestation expired");
        require(att.nonce == nonces[att.agentId], "ReputationRegistry: bad nonce");
        nonces[att.agentId] = att.nonce + 1;

        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                att.agentId,
                att.execution,
                att.reliability,
                att.quality,
                att.collaboration,
                att.tasksCompleted,
                att.proofHash,
                att.nonce,
                att.deadline
            )
        );
        address signer = _hashTypedDataV4(structHash).recover(sig);
        require(hasRole(EVALUATOR_ROLE, signer), "ReputationRegistry: invalid evaluator");

        agentReputation[att.agentId] = ReputationVector({
            execution: att.execution,
            reliability: att.reliability,
            quality: att.quality,
            collaboration: att.collaboration,
            tasksCompleted: att.tasksCompleted,
            proofHash: att.proofHash,
            updatedAt: block.timestamp
        });

        emit ScoreUpdated(
            att.agentId,
            att.execution,
            att.reliability,
            att.quality,
            att.collaboration,
            _composite(att.execution, att.reliability, att.quality, att.collaboration),
            att.proofHash
        );
    }

    function getVector(uint256 agentId) external view returns (ReputationVector memory) {
        return agentReputation[agentId];
    }

    /// @notice 综合分（0–10000）：30/30/25/15 加权。与链下 @c2c/reputation-engine 算法一致。
    function compositeScore(uint256 agentId) external view returns (uint256) {
        ReputationVector memory v = agentReputation[agentId];
        return _composite(v.execution, v.reliability, v.quality, v.collaboration);
    }

    function _composite(uint32 e, uint32 r, uint32 q, uint32 c) internal pure returns (uint256) {
        return (
            uint256(e) * WEIGHT_EXECUTION +
            uint256(r) * WEIGHT_RELIABILITY +
            uint256(q) * WEIGHT_QUALITY +
            uint256(c) * WEIGHT_COLLABORATION
        ) / (WEIGHT_EXECUTION + WEIGHT_RELIABILITY + WEIGHT_QUALITY + WEIGHT_COLLABORATION);
    }

    /// @notice 供链下签名工具读取 domain separator（构造 EIP-712 typed data 用）
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
