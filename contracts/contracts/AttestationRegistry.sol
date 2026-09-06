// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title AttestationRegistry
 * @notice C2C Protocol — 第三方证明注册表。
 *         记录"谁（issuer）证明了哪个 Agent（subjectAgentId）的什么（proofHash）"。
 *         证明全文存链下（IPFS 等），链上只锚定哈希；issuer 可撤销。
 */
contract AttestationRegistry {
    struct Attestation {
        address issuer;
        uint256 subjectAgentId;
        bytes32 proofHash;
        uint64 timestamp;
        bool revoked;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Attestation) public attestations;

    event Attested(uint256 indexed attestationId, address indexed issuer, uint256 indexed subjectAgentId, bytes32 proofHash);
    event Revoked(uint256 indexed attestationId, address indexed issuer);

    function attest(uint256 subjectAgentId, bytes32 proofHash) external returns (uint256 attestationId) {
        require(proofHash != bytes32(0), "AttestationRegistry: empty proof");
        attestationId = _nextId++;
        attestations[attestationId] = Attestation({
            issuer: msg.sender,
            subjectAgentId: subjectAgentId,
            proofHash: proofHash,
            timestamp: uint64(block.timestamp),
            revoked: false
        });
        emit Attested(attestationId, msg.sender, subjectAgentId, proofHash);
    }

    function revoke(uint256 attestationId) external {
        Attestation storage a = attestations[attestationId];
        require(a.timestamp != 0, "AttestationRegistry: nonexistent attestation");
        require(a.issuer == msg.sender, "AttestationRegistry: not issuer");
        require(!a.revoked, "AttestationRegistry: already revoked");
        a.revoked = true;
        emit Revoked(attestationId, msg.sender);
    }

    /// @notice 证明当前是否有效（存在且未撤销）
    function verify(uint256 attestationId) external view returns (bool) {
        Attestation memory a = attestations[attestationId];
        return a.timestamp != 0 && !a.revoked;
    }

    function totalAttestations() external view returns (uint256) {
        return _nextId - 1;
    }
}
