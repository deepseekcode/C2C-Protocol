// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReputationPassport
 * @notice C2C Protocol — 声誉护照（ERC1155，SBT 语义）。
 *         每个地址最多持有一枚 PASSPORT_ID，禁止转账（只允许 mint/burn）——声誉不可买卖。
 *         Score/Vector 存储在 ReputationRegistry，本合约只做凭证与元数据展示。
 */
contract ReputationPassport is ERC1155, AccessControl {
    uint256 public constant PASSPORT_ID = 1;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string public baseURI;

    event PassportMinted(address indexed to);
    event BaseURIUpdated(string newBaseURI);

    constructor(string memory baseURI_) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        baseURI = baseURI_;
    }

    /// @notice 铸造护照。MINTER_ROLE 由后端服务或用户自助流程调用。
    function mintPassport(address to) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "ReputationPassport: zero address");
        require(balanceOf(to, PASSPORT_ID) == 0, "ReputationPassport: passport exists");
        _mint(to, PASSPORT_ID, 1, "");
        emit PassportMinted(to);
    }

    function hasPassport(address account) external view returns (bool) {
        return balanceOf(account, PASSPORT_ID) > 0;
    }

    function setBaseURI(string calldata newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /// @notice 动态元数据入口（前端/钱包按 baseURI + agentId 拼取当前 Vector/Score）
    function uri(uint256) public view override returns (string memory) {
        return baseURI;
    }

    /// @dev SBT：禁止一切转账，仅允许 mint（from=0）与 burn（to=0）
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(from == address(0) || to == address(0), "ReputationPassport: SBT non-transferable");
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
