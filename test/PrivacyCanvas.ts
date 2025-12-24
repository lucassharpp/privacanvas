import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { PrivacyCanvas, PrivacyCanvas__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const MAX_CELL_ID = 100;

function maskFromIds(ids: number[]): bigint {
  return ids.reduce((mask, id) => mask | (1n << BigInt(id - 1)), 0n);
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("PrivacyCanvas")) as PrivacyCanvas__factory;
  const contract = (await factory.deploy()) as PrivacyCanvas;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("PrivacyCanvas", function () {
  let signers: Signers;
  let contract: PrivacyCanvas;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("canvas should be uninitialized after deployment", async function () {
    const encryptedCanvas = await contract.getCanvas(signers.alice.address);
    expect(encryptedCanvas).to.eq(ethers.ZeroHash);

    const hasCanvas = await contract.hasCanvas(signers.alice.address);
    expect(hasCanvas).to.eq(false);
  });

  it("saves and decrypts a canvas mask", async function () {
    const ids = [1, 5, 42, MAX_CELL_ID];
    const mask = maskFromIds(ids);

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add128(mask)
      .encrypt();

    const tx = await contract.connect(signers.alice).saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const encryptedCanvas = await contract.getCanvas(signers.alice.address);
    const clearMask = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedCanvas,
      contractAddress,
      signers.alice,
    );

    expect(BigInt(clearMask)).to.eq(mask);
    expect(await contract.hasCanvas(signers.alice.address)).to.eq(true);
  });

  it("overwrites the existing canvas mask", async function () {
    const firstMask = maskFromIds([2, 3, 7]);
    const secondMask = maskFromIds([10, 11, 12]);

    let encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add128(firstMask)
      .encrypt();

    let tx = await contract.connect(signers.alice).saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add128(secondMask)
      .encrypt();

    tx = await contract.connect(signers.alice).saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const encryptedCanvas = await contract.getCanvas(signers.alice.address);
    const clearMask = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedCanvas,
      contractAddress,
      signers.alice,
    );

    expect(BigInt(clearMask)).to.eq(secondMask);
  });
});
