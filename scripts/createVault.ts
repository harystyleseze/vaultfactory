const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { ethers } from "hardhat";

const main = async () => {
  const USDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const [deployer] = await ethers.getSigners();

  // Deploy VaultFactory
  const factory = await ethers.deployContract("VaultFactory");
  await factory.waitForDeployment();
  console.log("VaultFactory deployed at:", await factory.getAddress());

  const nftAddress = await factory.nft();
  const nftContract = await ethers.getContractAt("VaultNFT", nftAddress);

  // Preview the vault address before creation
  const predicted = await factory.previewVaultAddress(USDCAddress);
  console.log("Predicted vault address:", predicted);

  // BEFORE
  const vaultBefore = await factory.vaults(USDCAddress);
  const nftIdBefore = await nftContract.tokenToNftId(USDCAddress);

  console.log("================BEFORE=================");
  console.log("factory.vaults(USDC):", vaultBefore);
  console.log("nft.tokenToNftId(USDC):", nftIdBefore.toString());

  // Create the vault
  const tx = await factory.createVault(USDCAddress);
  const receipt = await tx.wait();

  // Parse VaultDeployed event
  const iface = factory.interface;
  let vaultAddr = "";
  let nftId = 0n;
  for (const log of receipt!.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "VaultDeployed") {
        vaultAddr = parsed.args.vault;
        nftId = parsed.args.nftId;
      }
    } catch {}
  }

  // AFTER
  const vaultAfter = await factory.vaults(USDCAddress);
  const nftIdAfter = await nftContract.tokenToNftId(USDCAddress);

  console.log("================AFTER==================");
  console.log("factory.vaults(USDC):", vaultAfter);
  console.log("Vault address from event:", vaultAddr);
  console.log("NFT ID from event:", nftId.toString());
  console.log("nft.tokenToNftId(USDC):", nftIdAfter.toString());

  console.log("=================DIFFERENCES===========");
  console.log(
    "Predicted == actual:",
    predicted.toLowerCase() === vaultAddr.toLowerCase()
  );
  console.log("Vault created (was zero):", vaultBefore === ethers.ZeroAddress);
  console.log("NFT ID assigned:", nftIdAfter.toString());
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
