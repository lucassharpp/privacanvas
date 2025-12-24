import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { PrivacyCanvas } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

function maskFromIds(ids: number[]): bigint {
  return ids.reduce((mask, id) => mask | (1n << BigInt(id - 1)), 0n);
}

describe("PrivacyCanvasSepolia", function () {
  let signers: Signers;
  let contract: PrivacyCanvas;
  let contractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("PrivacyCanvas");
      contractAddress = deployment.address;
      contract = await ethers.getContractAt("PrivacyCanvas", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("saves and decrypts a canvas mask", async function () {
    steps = 8;

    this.timeout(4 * 40000);

    const ids = [1, 2, 3, 4, 5];
    const mask = maskFromIds(ids);

    progress("Encrypting canvas mask...");
    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add128(mask)
      .encrypt();

    progress(`Calling saveCanvas() on PrivacyCanvas=${contractAddress}...`);
    let tx = await contract.connect(signers.alice).saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    progress(`Calling getCanvas()...`);
    const encryptedCanvas = await contract.getCanvas(signers.alice.address);
    expect(encryptedCanvas).to.not.eq(ethers.ZeroHash);

    progress(`Decrypting getCanvas()=${encryptedCanvas}...`);
    const clearMask = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedCanvas,
      contractAddress,
      signers.alice,
    );
    progress(`Clear canvas mask=${clearMask}`);

    expect(BigInt(clearMask)).to.eq(mask);
  });
});
