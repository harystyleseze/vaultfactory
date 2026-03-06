const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { ethers } from "hardhat";
const fs = require("fs");

const main = async () => {
  const USDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WhaleAddress = "0x28C6c06298d514Db089934071355E5743bf21d60";
  // let's deposit 42,000 USDC
  const depositAmount = ethers.parseUnits("42000", 6); 

  // 1. Deploy factory (this also deploys VaultNFT inside its constructor)
  const factory = await ethers.deployContract("VaultFactory");
  await factory.waitForDeployment();
  console.log("Factory deployed at:", await factory.getAddress());

  // 2. Create a vault for USDC — this mints NFT #1 to the vault
  await (await factory.createVault(USDCAddress)).wait();
  const vaultAddr = await factory.vaults(USDCAddress);
  console.log("USDC vault at:", vaultAddr);

  // 3. Impersonate whale and deposit 42,000 USDC so the SVG shows a real number
  await helpers.impersonateAccount(WhaleAddress);
  const whaleSigner = await ethers.getSigner(WhaleAddress);

  const usdc = await ethers.getContractAt("IERC20", USDCAddress, whaleSigner);
  await (await usdc.approve(await factory.getAddress(), depositAmount)).wait();
  await (await factory.connect(whaleSigner).deposit(USDCAddress, depositAmount)).wait();
  console.log("Deposited 42,000 USDC into vault");

  // 4. Call tokenURI on the NFT contract
  const nftAddr = await factory.nft();
  const nft = await ethers.getContractAt("VaultNFT", nftAddr);
  const uri = await nft.tokenURI(1);

  // 5. Decode the outer base64 JSON
  const jsonBase64 = uri.replace("data:application/json;base64,", "");
  const json = JSON.parse(Buffer.from(jsonBase64, "base64").toString("utf8"));

  console.log("\n--- NFT Metadata ---");
  console.log("Name:", json.name);
  console.log("Description:", json.description);
  console.log("Attributes:");
  json.attributes.forEach((a: any) => {
    console.log(`  ${a.trait_type}: ${a.value ?? a.value}`);
  });

  // 6. Decode the SVG from the image field
  const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
  const svg = Buffer.from(svgBase64, "base64").toString("utf8");

  // 7. Save SVG to file
  fs.writeFileSync("nft-preview.svg", svg);
  console.log("\nSaved SVG to nft-preview.svg");
  console.log("Open it in your browser to view the NFT art.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
