// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint128, externalEuint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivacyCanvas
/// @notice Stores an encrypted 10x10 canvas using a 100-bit mask per user.
contract PrivacyCanvas is ZamaEthereumConfig {
    uint8 public constant GRID_SIZE = 10;
    uint16 public constant CELL_COUNT = 100;

    mapping(address => euint128) private _canvases;
    mapping(address => bool) private _hasCanvas;

    event CanvasSaved(address indexed owner);

    /// @notice Save the caller's canvas as an encrypted bitmask.
    /// @param encryptedMask The encrypted 100-bit mask (bit i represents cell id i+1).
    /// @param inputProof Proof for the encrypted input.
    function saveCanvas(externalEuint128 encryptedMask, bytes calldata inputProof) external {
        euint128 canvasMask = FHE.fromExternal(encryptedMask, inputProof);
        _canvases[msg.sender] = canvasMask;
        _hasCanvas[msg.sender] = true;

        FHE.allowThis(canvasMask);
        FHE.allow(canvasMask, msg.sender);

        emit CanvasSaved(msg.sender);
    }

    /// @notice Returns the encrypted canvas for the provided owner.
    /// @param owner The address of the canvas owner.
    function getCanvas(address owner) external view returns (euint128) {
        return _canvases[owner];
    }

    /// @notice Returns whether the provided owner has saved a canvas.
    /// @param owner The address of the canvas owner.
    function hasCanvas(address owner) external view returns (bool) {
        return _hasCanvas[owner];
    }
}
