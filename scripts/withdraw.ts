const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { ethers } from "hardhat";

const main = async () => {
  const USDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WhaleAddress = "0x28C6c06298d514Db089934071355E5743bf21d60";
  const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
  const withdrawAmount = ethers.parseUnits("400", 6); // 400 USDC

  const [deployer] = await ethers.getSigners();

  // Deploy VaultFactory and create vault
  const factory = await ethers.deployContract("VaultFactory");
  await factory.waitForDeployment();
  console.log("VaultFactory deployed at:", await factory.getAddress());

  await (await factory.createVault(USDCAddress)).wait();
  const vaultAddr = await factory.vaults(USDCAddress);
  console.log("Vault created at:", vaultAddr);

  // Impersonate whale
  await helpers.impersonateAccount(WhaleAddress);
  const whaleSigner = await ethers.getSigner(WhaleAddress);

  const usdcContract = await ethers.getContractAt(
    "IERC20",
    USDCAddress,
    whaleSigner
  );
  const factoryAsWhale = factory.connect(whaleSigner);
  const vaultContract = await ethers.getContractAt(
    "TokenVault",
    vaultAddr,
    whaleSigner
  );

  // Setup: deposit 1000 USDC
  await (
    await usdcContract.approve(await factory.getAddress(), depositAmount)
  ).wait();
  await (await factoryAsWhale.deposit(USDCAddress, depositAmount)).wait();
  console.log("Setup: deposited", ethers.formatUnits(depositAmount, 6), "USDC");

  // BEFORE WITHDRAW
  const usdcBefore = await usdcContract.balanceOf(WhaleAddress);
  const vaultBalBefore = await vaultContract.balanceOf(WhaleAddress);
  const totalBefore = await vaultContract.totalDeposited();

  console.log("================BEFORE WITHDRAW========");
  console.log("Whale USDC balance:", ethers.formatUnits(usdcBefore, 6));
  console.log(
    "Vault balanceOf(whale):",
    ethers.formatUnits(vaultBalBefore, 6)
  );
  console.log("Vault totalDeposited:", ethers.formatUnits(totalBefore, 6));

  // Withdraw
  await (await vaultContract.withdraw(withdrawAmount)).wait();

  // AFTER
  const usdcAfter = await usdcContract.balanceOf(WhaleAddress);
  const vaultBalAfter = await vaultContract.balanceOf(WhaleAddress);
  const totalAfter = await vaultContract.totalDeposited();

  console.log("================AFTER==================");
  console.log("Whale USDC balance:", ethers.formatUnits(usdcAfter, 6));
  console.log("Vault balanceOf(whale):", ethers.formatUnits(vaultBalAfter, 6));
  console.log("Vault totalDeposited:", ethers.formatUnits(totalAfter, 6));

  console.log("=================DIFFERENCES===========");
  console.log(
    "USDC received back by whale:",
    ethers.formatUnits(usdcAfter - usdcBefore, 6)
  );
  console.log(
    "Vault balance reduced by:",
    ethers.formatUnits(vaultBalBefore - vaultBalAfter, 6)
  );
  console.log(
    "Vault total reduced by:",
    ethers.formatUnits(totalBefore - totalAfter, 6)
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
