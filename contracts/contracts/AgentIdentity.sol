// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title AgentIdentity
 * @notice C2C Protocol — AI Agent 链上身份（ERC721）。每个 Agent 一个 token，owner 即其人类控制者。
 *         metadataURI 指向 IPFS 上的 Agent 描述（name / framework / capabilities / operator）。
 *         framework 仅为元数据标签，协议对 agent 类型不做任何限制（agent-agnostic）。
 */
contract AgentIdentity is ERC721 {
    struct AgentMeta {
        string metadataURI;
        uint256 createdAt;
        bool active;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => AgentMeta) private _agents;

    event AgentCreated(uint256 indexed agentId, address indexed owner, string metadataURI);
    event MetadataUpdated(uint256 indexed agentId, string metadataURI);
    event AgentDeactivated(uint256 indexed agentId);

    constructor() ERC721("C2C Agent Identity", "C2CAGENT") {}

    modifier onlyAgentOwner(uint256 agentId) {
        require(ownerOf(agentId) == msg.sender, "AgentIdentity: not agent owner");
        _;
    }

    function createAgent(string calldata metadataURI) external returns (uint256 agentId) {
        agentId = _nextId++;
        _agents[agentId] = AgentMeta({metadataURI: metadataURI, createdAt: block.timestamp, active: true});
        _safeMint(msg.sender, agentId);
        emit AgentCreated(agentId, msg.sender, metadataURI);
    }

    function updateMetadata(uint256 agentId, string calldata metadataURI) external onlyAgentOwner(agentId) {
        _agents[agentId].metadataURI = metadataURI;
        emit MetadataUpdated(agentId, metadataURI);
    }

    function deactivate(uint256 agentId) external onlyAgentOwner(agentId) {
        _agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    function getAgent(uint256 agentId) external view returns (AgentMeta memory) {
        require(_ownerOf(agentId) != address(0), "AgentIdentity: nonexistent agent");
        return _agents[agentId];
    }

    function ownerOfAgent(uint256 agentId) external view returns (address) {
        return ownerOf(agentId);
    }

    /// @notice 已注册 Agent 总数（MVP 指标：>= 100）
    function totalAgents() external view returns (uint256) {
        return _nextId - 1;
    }
}
