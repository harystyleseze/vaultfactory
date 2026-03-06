import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { VaultFactory, VaultNFT, TokenVault } from "../typechain-types";
import type { IERC20 } from "../typechain-types/contracts/IERC20.sol";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI_ADDRESS  = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const USDC_WHALE = "0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf";
const DAI_WHALE  = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
const WETH_WHALE = "0x2F0b23f53734252Bda2277357e97e1517d6B042A";

async function impersonateWithFunds(address: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [address]);
  await ethers.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]);
  return ethers.getSigner(address);
}

async function stopImpersonating(address: string) {
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [address]);
}

async function deployFactoryFixture() {
  const [deployer, alice, bob] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("VaultFactory");
  const factory = (await Factory.deploy()) as VaultFactory;
  await factory.waitForDeployment();

  const nftAddress = await factory.nft();
  const nft = (await ethers.getContractAt("VaultNFT", nftAddress)) as VaultNFT;

  return { factory, nft, deployer, alice, bob };
}

describe("VaultFactory (mainnet fork, CREATE2 + on-chain SVG)", function () {
  this.timeout(120_000);

  describe("Deployment", function () {
    it("deploys VaultFactory and VaultNFT", async function () {
      const { factory, nft } = await loadFixture(deployFactoryFixture);
      expect(await factory.getAddress()).to.be.properAddress;
      expect(await nft.getAddress()).to.be.properAddress;
    });

    it("VaultNFT factory pointer matches VaultFactory address", async function () {
      const { factory, nft } = await loadFixture(deployFactoryFixture);
      expect(await nft.factory()).to.equal(await factory.getAddress());
    });
  });

  describe("previewVaultAddress", function () {
    it("predicts USDC vault address before deployment", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.previewVaultAddress(USDC_ADDRESS);
      expect(predicted).to.be.properAddress;
      expect(await factory.getVault(USDC_ADDRESS)).to.equal(ethers.ZeroAddress);
    });

    it("predicted address matches actual deployed address after createVault", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.previewVaultAddress(USDC_ADDRESS);
      await factory.createVault(USDC_ADDRESS);
      expect(await factory.getVault(USDC_ADDRESS)).to.equal(predicted);
    });
  });

  describe("createVault", function () {
    it("deploys vault and mints NFT #1 to the vault itself", async function () {
      const { factory, nft } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);
      const vaultAddr = await factory.getVault(USDC_ADDRESS);
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(await nft.ownerOf(1)).to.equal(vaultAddr);
    });

    it("emits VaultDeployed with correct args", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      const predicted = await factory.previewVaultAddress(USDC_ADDRESS);
      await expect(factory.createVault(USDC_ADDRESS))
        .to.emit(factory, "VaultDeployed")
        .withArgs(USDC_ADDRESS, predicted, 1n);
    });

    it("reverts if vault already created for same token", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);
      await expect(factory.createVault(USDC_ADDRESS)).to.be.revertedWith("vault exists");
    });

    it("adds vault to allVaults list", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);
      const all = await factory.allVaults();
      expect(all.length).to.equal(1);
      expect(all[0]).to.equal(await factory.getVault(USDC_ADDRESS));
    });
  });

  describe("deposit", function () {
    it("reverts with 'no vault' if vault not yet created", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      await expect(factory.deposit(USDC_ADDRESS, 1_000n * 10n ** 6n))
        .to.be.revertedWith("no vault");
    });

    it("reverts with 'zero amount' for zero deposit", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);
      await expect(factory.deposit(USDC_ADDRESS, 0)).to.be.revertedWith("zero amount");
    });

    it("records user balance and totalDeposited after deposit", async function () {
      const { factory, alice } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);

      const usdc = await ethers.getContractAt("contracts/IERC20.sol:IERC20", USDC_ADDRESS) as unknown as IERC20;
      const whale = await impersonateWithFunds(USDC_WHALE);
      const amount = 1_000n * 10n ** 6n;
      await usdc.connect(whale).transfer(alice.address, amount);
      await stopImpersonating(USDC_WHALE);

      await usdc.connect(alice).approve(await factory.getAddress(), amount);
      await factory.connect(alice).deposit(USDC_ADDRESS, amount);

      const vaultAddr = await factory.getVault(USDC_ADDRESS);
      const vault = (await ethers.getContractAt("TokenVault", vaultAddr)) as TokenVault;
      expect(await vault.balanceOf(alice.address)).to.equal(amount);
      expect(await vault.totalDeposited()).to.equal(amount);
    });

    it("multiple users deposit into same vault without re-deploying", async function () {
      const { factory, alice, bob } = await loadFixture(deployFactoryFixture);
      await factory.createVault(USDC_ADDRESS);

      const usdc = await ethers.getContractAt("contracts/IERC20.sol:IERC20", USDC_ADDRESS) as unknown as IERC20;
      const whale = await impersonateWithFunds(USDC_WHALE);
      const amount = 1_000n * 10n ** 6n;
      await usdc.connect(whale).transfer(alice.address, amount);
      await usdc.connect(whale).transfer(bob.address, amount);
      await stopImpersonating(USDC_WHALE);

      const factoryAddr = await factory.getAddress();
      await usdc.connect(alice).approve(factoryAddr, amount);
      await usdc.connect(bob).approve(factoryAddr, amount);
      await factory.connect(alice).deposit(USDC_ADDRESS, amount);
      await factory.connect(bob).deposit(USDC_ADDRESS, amount);

      const vaultAddr = await factory.getVault(USDC_ADDRESS);
      const vault = (await ethers.getContractAt("TokenVault", vaultAddr)) as TokenVault;
      expect(await vault.balanceOf(alice.address)).to.equal(amount);
      expect(await vault.balanceOf(bob.address)).to.equal(amount);
      expect(await vault.totalDeposited()).to.equal(amount * 2n);
      expect((await factory.allVaults()).length).to.equal(1);
    });
  });

  describe("withdraw", function () {
    async function depositFixture() {
      const base = await deployFactoryFixture();
      const { factory, alice } = base;
      await factory.createVault(USDC_ADDRESS);

      const usdc = await ethers.getContractAt("contracts/IERC20.sol:IERC20", USDC_ADDRESS) as unknown as IERC20;
      const whale = await impersonateWithFunds(USDC_WHALE);
      const amount = 5_000n * 10n ** 6n;
      await usdc.connect(whale).transfer(alice.address, amount);
      await stopImpersonating(USDC_WHALE);

      await usdc.connect(alice).approve(await factory.getAddress(), amount);
      await factory.connect(alice).deposit(USDC_ADDRESS, amount);

      const vaultAddr = await factory.getVault(USDC_ADDRESS);
      const vault = (await ethers.getContractAt("TokenVault", vaultAddr)) as TokenVault;
      return { ...base, usdc, vault, amount };
    }

    it("Alice can withdraw her full balance", async function () {
      const { vault, usdc, alice, amount } = await loadFixture(depositFixture);
      const balBefore = await usdc.balanceOf(alice.address);
      await vault.connect(alice).withdraw(amount);
      const balAfter = await usdc.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(amount);
      expect(await vault.balanceOf(alice.address)).to.equal(0n);
    });

    it("partial withdrawal reduces balance correctly", async function () {
      const { vault, alice, amount } = await loadFixture(depositFixture);
      const half = amount / 2n;
      await vault.connect(alice).withdraw(half);
      expect(await vault.balanceOf(alice.address)).to.equal(amount - half);
    });

    it("reverts when withdrawing more than deposited", async function () {
      const { vault, alice, amount } = await loadFixture(depositFixture);
      await expect(vault.connect(alice).withdraw(amount + 1n)).to.be.revertedWith("insufficient balance");
    });
  });

  describe("NFT", function () {
    async function nftFixture() {
      const base = await deployFactoryFixture();
      const { factory, alice } = base;
      await factory.createVault(USDC_ADDRESS);

      const usdc = await ethers.getContractAt("contracts/IERC20.sol:IERC20", USDC_ADDRESS) as unknown as IERC20;
      const whale = await impersonateWithFunds(USDC_WHALE);
      const amount = 42_000n * 10n ** 6n;
      await usdc.connect(whale).transfer(alice.address, amount);
      await stopImpersonating(USDC_WHALE);

      await usdc.connect(alice).approve(await factory.getAddress(), amount);
      await factory.connect(alice).deposit(USDC_ADDRESS, amount);

      const vaultAddr = await factory.getVault(USDC_ADDRESS);
      const vault = (await ethers.getContractAt("TokenVault", vaultAddr)) as TokenVault;
      return { ...base, usdc, vault, vaultAddr, amount };
    }

    it("NFT #1 is owned by the vault contract, not the depositor", async function () {
      const { nft, alice, vaultAddr } = await loadFixture(nftFixture);
      expect(await nft.ownerOf(1)).to.equal(vaultAddr);
      expect(await nft.balanceOf(alice.address)).to.equal(0n);
      expect(await nft.balanceOf(vaultAddr)).to.equal(1n);
    });

    it("tokenURI returns a data URI", async function () {
      const { nft } = await loadFixture(nftFixture);
      const uri = await nft.tokenURI(1);
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("decoded JSON has correct name and attributes", async function () {
      const { nft } = await loadFixture(nftFixture);
      const uri = await nft.tokenURI(1);
      const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
      expect(json.name).to.include("USDC");
      expect(json.description).to.include("USD Coin");
      const symbolAttr = json.attributes.find((a: any) => a.trait_type === "Token Symbol");
      expect(symbolAttr?.value).to.equal("USDC");
    });

    it("image field is a base64-encoded SVG containing TOKEN VAULT", async function () {
      const { nft } = await loadFixture(nftFixture);
      const svg = extractSVG(await nft.tokenURI(1));
      expect(svg).to.match(/^<svg/);
      expect(svg).to.include("TOKEN VAULT");
      expect(svg).to.include("USDC");
    });

    it("SVG reflects live totalDeposited and updates after withdrawal", async function () {
      const { nft, vault, alice, amount } = await loadFixture(nftFixture);
      expect(extractSVG(await nft.tokenURI(1))).to.include("42000");

      await vault.connect(alice).withdraw(amount);
      expect(extractSVG(await nft.tokenURI(1))).to.include("0.0000");
    });
  });

  describe("Multiple tokens", function () {
    it("USDC, DAI, and WETH each get their own vault and own NFT", async function () {
      const { factory, nft, alice } = await loadFixture(deployFactoryFixture);

      await factory.createVault(USDC_ADDRESS);
      await factory.createVault(DAI_ADDRESS);
      await factory.createVault(WETH_ADDRESS);

      const usdc = await ethers.getContractAt("contracts/IERC20.sol:IERC20", USDC_ADDRESS) as unknown as IERC20;
      const uWhale = await impersonateWithFunds(USDC_WHALE);
      await usdc.connect(uWhale).transfer(alice.address, 1_000n * 10n ** 6n);
      await stopImpersonating(USDC_WHALE);

      const dai = await ethers.getContractAt("contracts/IERC20.sol:IERC20", DAI_ADDRESS) as unknown as IERC20;
      const dWhale = await impersonateWithFunds(DAI_WHALE);
      await dai.connect(dWhale).transfer(alice.address, ethers.parseEther("1000"));
      await stopImpersonating(DAI_WHALE);

      const weth = await ethers.getContractAt("contracts/IERC20.sol:IERC20", WETH_ADDRESS) as unknown as IERC20;
      const wWhale = await impersonateWithFunds(WETH_WHALE);
      await weth.connect(wWhale).transfer(alice.address, ethers.parseEther("1"));
      await stopImpersonating(WETH_WHALE);

      const factoryAddr = await factory.getAddress();
      await usdc.connect(alice).approve(factoryAddr, ethers.MaxUint256);
      await dai.connect(alice).approve(factoryAddr, ethers.MaxUint256);
      await weth.connect(alice).approve(factoryAddr, ethers.MaxUint256);

      await factory.connect(alice).deposit(USDC_ADDRESS, 1_000n * 10n ** 6n);
      await factory.connect(alice).deposit(DAI_ADDRESS, ethers.parseEther("1000"));
      await factory.connect(alice).deposit(WETH_ADDRESS, ethers.parseEther("1"));

      const allVaults = await factory.allVaults();
      expect(allVaults.length).to.equal(3);
      expect(new Set(allVaults).size).to.equal(3);

      for (const addr of [USDC_ADDRESS, DAI_ADDRESS, WETH_ADDRESS]) {
        expect(await factory.getVault(addr)).to.not.equal(ethers.ZeroAddress);
      }

      // Each NFT is owned by its own vault
      for (let i = 1; i <= 3; i++) {
        const owner = await nft.ownerOf(i);
        expect(allVaults).to.include(owner);
      }
    });
  });
});

function extractSVG(tokenURI: string): string {
  const json = JSON.parse(Buffer.from(tokenURI.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
  return Buffer.from(json.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
}
