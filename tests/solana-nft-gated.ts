import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaNftGated } from "../target/types/solana_nft_gated";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("solana-nft-gated", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaNftGated as Program<SolanaNftGated>;

  const authority = Keypair.generate();
  const holder = Keypair.generate();

  let nftMint: PublicKey;
  let holderTokenAccount: PublicKey;
  let gatePDA: PublicKey;
  let gateBump: number;

  // Helpers
  const findGatePDA = (
    authorityKey: PublicKey,
    mintKey: PublicKey
  ): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("gate"),
        authorityKey.toBuffer(),
        mintKey.toBuffer(),
      ],
      program.programId
    );
  };

  const findAccessRecordPDA = (
    gateKey: PublicKey,
    walletKey: PublicKey
  ): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("access"), gateKey.toBuffer(), walletKey.toBuffer()],
      program.programId
    );
  };

  before(async () => {
    // Fund both wallets
    const sig1 = await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    const sig2 = await provider.connection.requestAirdrop(
      holder.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig1);
    await provider.connection.confirmTransaction(sig2);

    // Create an NFT mint (0 decimals)
    nftMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      0
    );

    // Create holder's token account and mint 1 NFT to it
    holderTokenAccount = await createAccount(
      provider.connection,
      holder,
      nftMint,
      holder.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      nftMint,
      holderTokenAccount,
      authority,
      1
    );

    // Derive gate PDA
    [gatePDA, gateBump] = findGatePDA(authority.publicKey, nftMint);
  });

  // ---------- create_gate ----------

  describe("create_gate", () => {
    it("creates a gate for a given NFT collection mint", async () => {
      const gateName = "VIP Access";

      await program.methods
        .createGate(gateName)
        .accounts({
          authority: authority.publicKey,
          requiredMint: nftMint,
          gate: gatePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const gate = await program.account.gate.fetch(gatePDA);
      expect(gate.authority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(gate.requiredMint.toBase58()).to.equal(nftMint.toBase58());
      expect(gate.name).to.equal(gateName);
      expect(gate.totalAccesses.toNumber()).to.equal(0);
    });

    it("rejects a gate name longer than 32 characters", async () => {
      const otherMint = await createMint(
        provider.connection,
        authority,
        authority.publicKey,
        null,
        0
      );
      const [otherGatePDA] = findGatePDA(authority.publicKey, otherMint);
      const longName = "X".repeat(33);

      try {
        await program.methods
          .createGate(longName)
          .accounts({
            authority: authority.publicKey,
            requiredMint: otherMint,
            gate: otherGatePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("NameTooLong");
      }
    });
  });

  // ---------- access ----------

  describe("access", () => {
    it("grants access to an NFT holder", async () => {
      const [accessRecordPDA] = findAccessRecordPDA(
        gatePDA,
        holder.publicKey
      );

      await program.methods
        .access()
        .accounts({
          holder: holder.publicKey,
          gate: gatePDA,
          holderTokenAccount: holderTokenAccount,
          accessRecord: accessRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([holder])
        .rpc();

      const record = await program.account.accessRecord.fetch(accessRecordPDA);
      expect(record.gate.toBase58()).to.equal(gatePDA.toBase58());
      expect(record.wallet.toBase58()).to.equal(holder.publicKey.toBase58());
      expect(record.mintUsed.toBase58()).to.equal(nftMint.toBase58());
      expect(record.accessCount.toNumber()).to.equal(1);
      expect(record.firstAccess.toNumber()).to.be.greaterThan(0);

      // Gate total_accesses should increment
      const gate = await program.account.gate.fetch(gatePDA);
      expect(gate.totalAccesses.toNumber()).to.equal(1);
    });

    it("denies access when holder has no NFT", async () => {
      const noNftHolder = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        noNftHolder.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create empty token account for this user
      const emptyTokenAccount = await createAccount(
        provider.connection,
        noNftHolder,
        nftMint,
        noNftHolder.publicKey
      );

      const [accessRecordPDA] = findAccessRecordPDA(
        gatePDA,
        noNftHolder.publicKey
      );

      try {
        await program.methods
          .access()
          .accounts({
            holder: noNftHolder.publicKey,
            gate: gatePDA,
            holderTokenAccount: emptyTokenAccount,
            accessRecord: accessRecordPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([noNftHolder])
          .rpc();
        expect.fail("should have thrown NoNftHeld");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("NoNftHeld");
      }
    });

    it("re_access increments access count", async () => {
      const [accessRecordPDA] = findAccessRecordPDA(
        gatePDA,
        holder.publicKey
      );

      await program.methods
        .reAccess()
        .accounts({
          holder: holder.publicKey,
          gate: gatePDA,
          holderTokenAccount: holderTokenAccount,
          accessRecord: accessRecordPDA,
        })
        .signers([holder])
        .rpc();

      const record = await program.account.accessRecord.fetch(accessRecordPDA);
      expect(record.accessCount.toNumber()).to.equal(2);

      const gate = await program.account.gate.fetch(gatePDA);
      expect(gate.totalAccesses.toNumber()).to.equal(2);
    });
  });

  // ---------- revoke_access ----------

  describe("revoke_access", () => {
    it("authority revokes access and closes the record account", async () => {
      const [accessRecordPDA] = findAccessRecordPDA(
        gatePDA,
        holder.publicKey
      );

      // Confirm record exists before revocation
      const recordBefore = await program.account.accessRecord.fetch(
        accessRecordPDA
      );
      expect(recordBefore.wallet.toBase58()).to.equal(
        holder.publicKey.toBase58()
      );

      // Get authority lamport balance before (rent should be returned)
      const balanceBefore = await provider.connection.getBalance(
        authority.publicKey
      );

      await program.methods
        .revokeAccess()
        .accounts({
          authority: authority.publicKey,
          gate: gatePDA,
          accessRecord: accessRecordPDA,
        })
        .signers([authority])
        .rpc();

      // Record account should be closed (rent returned to authority)
      const balanceAfter = await provider.connection.getBalance(
        authority.publicKey
      );
      expect(balanceAfter).to.be.greaterThan(balanceBefore);

      // Fetching the closed account should fail
      try {
        await program.account.accessRecord.fetch(accessRecordPDA);
        expect.fail("account should have been closed");
      } catch (err: any) {
        // Account no longer exists — this is the expected path
        expect(err.message).to.include("Account does not exist");
      }
    });

    it("non-authority cannot revoke access", async () => {
      // First, re-create an access record for holder
      const [accessRecordPDA] = findAccessRecordPDA(
        gatePDA,
        holder.publicKey
      );

      await program.methods
        .access()
        .accounts({
          holder: holder.publicKey,
          gate: gatePDA,
          holderTokenAccount: holderTokenAccount,
          accessRecord: accessRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([holder])
        .rpc();

      // Try revoking from a non-authority
      const imposter = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .revokeAccess()
          .accounts({
            authority: imposter.publicKey,
            gate: gatePDA,
            accessRecord: accessRecordPDA,
          })
          .signers([imposter])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        // has_one = authority constraint should fail
        expect(err).to.exist;
      }
    });
  });
});
