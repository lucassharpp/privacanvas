import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPrivacyCanvas = await deploy("PrivacyCanvas", {
    from: deployer,
    log: true,
  });

  console.log(`PrivacyCanvas contract: `, deployedPrivacyCanvas.address);
};
export default func;
func.id = "deploy_privacyCanvas"; // id required to prevent reexecution
func.tags = ["PrivacyCanvas"];
