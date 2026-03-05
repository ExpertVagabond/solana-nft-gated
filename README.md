# solana-nft-gated

Gate access to on-chain resources by requiring NFT ownership. Verify collection membership and grant access in a single transaction.

![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- Collection-based NFT verification
- On-chain access control
- Metaplex metadata integration
- Configurable collection requirements

## Program Instructions

`initialize` | `verify_access`

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

## Deploy

```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet
anchor deploy --provider.cluster mainnet
```

## Project Structure

```
programs/
  solana-nft-gated/
    src/
      lib.rs          # Program entry point and instructions
    Cargo.toml
tests/
  solana-nft-gated.ts           # Integration tests
Anchor.toml             # Anchor configuration
```

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

Built by [Purple Squirrel Media](https://purplesquirrelmedia.io)
