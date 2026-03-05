# solana-nft-gated

NFT-gated access control for on-chain resources with per-wallet tracking on Solana.

![Rust](https://img.shields.io/badge/Rust-000000?logo=rust) ![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white) ![Anchor](https://img.shields.io/badge/Anchor-blue) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Overview

A Solana Anchor program that restricts access to on-chain resources based on NFT ownership. An authority creates a named gate tied to a specific token mint. Users holding at least one token of that mint can request access, which creates a persistent `AccessRecord` PDA tracking their usage. The authority can revoke access at any time by closing the record. Supports both first-time access and repeat access patterns.

## Program Instructions

| Instruction | Description | Key Accounts |
|---|---|---|
| `create_gate` | Create a named access gate tied to a required NFT mint | `authority` (signer), `required_mint`, `gate` (PDA) |
| `access` | First-time access: verify NFT ownership and create an access record | `holder` (signer), `gate`, `holder_token_account`, `access_record` (PDA) |
| `re_access` | Subsequent access: verify NFT still held and increment access count | `holder` (signer), `gate`, `holder_token_account`, `access_record` |
| `revoke_access` | Authority revokes a wallet's access by closing their record | `authority` (signer), `gate`, `access_record` |

## Account Structures

### Gate

| Field | Type | Description |
|---|---|---|
| `authority` | `Pubkey` | Gate admin who can revoke access |
| `required_mint` | `Pubkey` | Token mint required for access |
| `name` | `String` | Human-readable gate name (max 32 chars) |
| `total_accesses` | `u64` | Cumulative access count across all wallets |
| `bump` | `u8` | PDA bump seed |

### AccessRecord

| Field | Type | Description |
|---|---|---|
| `gate` | `Pubkey` | Associated gate |
| `wallet` | `Pubkey` | Holder's wallet address |
| `mint_used` | `Pubkey` | Token mint used for access verification |
| `first_access` | `i64` | Unix timestamp of first access |
| `access_count` | `u64` | Number of times this wallet accessed the gate |
| `bump` | `u8` | PDA bump seed |

## PDA Seeds

- **Gate:** `["gate", authority, required_mint]`
- **AccessRecord:** `["access", gate, holder]`

## Error Codes

| Error | Description |
|---|---|
| `NameTooLong` | Gate name exceeds 32 characters |
| `NoNftHeld` | Wallet does not hold the required NFT |
| `Overflow` | Arithmetic overflow |

## Build & Test

```bash
anchor build
anchor test
```

## Deploy

```bash
solana config set --url devnet
anchor deploy
```

## License

[MIT](LICENSE)
