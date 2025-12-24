import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const MAX_CELL_ID = 100;

function parseIds(idsValue: string): number[] {
  const ids = idsValue
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => Number(id));

  if (ids.length === 0) {
    throw new Error("Argument --ids must contain at least one id");
  }

  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1 || id > MAX_CELL_ID) {
      throw new Error(`Invalid cell id ${id}. Expected an integer between 1 and ${MAX_CELL_ID}.`);
    }
  }

  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function maskFromIds(ids: number[]): bigint {
  return ids.reduce((mask, id) => mask | (1n << BigInt(id - 1)), 0n);
}

function idsFromMask(mask: bigint): number[] {
  const ids: number[] = [];
  for (let index = 0; index < MAX_CELL_ID; index += 1) {
    if ((mask >> BigInt(index)) & 1n) {
      ids.push(index + 1);
    }
  }
  return ids;
}

task("task:address", "Prints the PrivacyCanvas address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const deployment = await deployments.get("PrivacyCanvas");

  console.log("PrivacyCanvas address is " + deployment.address);
});

task("task:save-canvas", "Encrypts and saves a canvas mask for the caller")
  .addOptionalParam("address", "Optionally specify the PrivacyCanvas contract address")
  .addParam("ids", "Comma-separated list of cell ids (1-100)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const ids = parseIds(taskArguments.ids);
    const mask = maskFromIds(ids);

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivacyCanvas");
    console.log(`PrivacyCanvas: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivacyCanvas", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add128(mask)
      .encrypt();

    const tx = await contract.connect(signers[0]).saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log(`PrivacyCanvas saved ids: ${ids.join(", ")}`);
  });

task("task:decrypt-canvas", "Decrypts the caller canvas mask")
  .addOptionalParam("address", "Optionally specify the PrivacyCanvas contract address")
  .addParam("owner", "Canvas owner address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivacyCanvas");
    console.log(`PrivacyCanvas: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivacyCanvas", deployment.address);

    const encryptedCanvas = await contract.getCanvas(taskArguments.owner);
    if (encryptedCanvas === ethers.ZeroHash) {
      console.log(`Encrypted canvas: ${encryptedCanvas}`);
      console.log("Decoded ids     : (empty)");
      return;
    }

    const clearMask = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedCanvas,
      deployment.address,
      signers[0],
    );

    const ids = idsFromMask(BigInt(clearMask));
    console.log(`Encrypted canvas: ${encryptedCanvas}`);
    console.log(`Decoded ids     : ${ids.length > 0 ? ids.join(", ") : "(empty)"}`);
  });
