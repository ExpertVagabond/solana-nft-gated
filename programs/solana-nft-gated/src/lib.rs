use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("F17Fg2ZHx1UZqNCBeueuuiDiVJwBLP8NqrLCPJPFQ4Pg");

#[program]
pub mod solana_nft_gated {
    use super::*;

    pub fn create_gate(ctx: Context<CreateGate>, name: String) -> Result<()> {
        require!(name.len() <= 32, GateError::NameTooLong);
        let gate = &mut ctx.accounts.gate;
        gate.authority = ctx.accounts.authority.key();
        gate.required_mint = ctx.accounts.required_mint.key();
        gate.name = name;
        gate.total_accesses = 0;
        gate.bump = ctx.bumps.gate;

        emit!(GateCreated {
            gate: gate.key(),
            authority: gate.authority,
            required_collection: gate.required_mint,
        });

        Ok(())
    }

    pub fn access(ctx: Context<Access>) -> Result<()> {
        require!(ctx.accounts.holder_token_account.amount >= 1, GateError::NoNftHeld);

        let gate = &mut ctx.accounts.gate;
        gate.total_accesses = gate.total_accesses.checked_add(1).ok_or(GateError::Overflow)?;

        let record = &mut ctx.accounts.access_record;
        record.gate = gate.key();
        record.wallet = ctx.accounts.holder.key();
        record.mint_used = ctx.accounts.holder_token_account.mint;
        record.first_access = Clock::get()?.unix_timestamp;
        record.access_count = 1;
        record.bump = ctx.bumps.access_record;

        emit!(AccessGranted {
            gate: gate.key(),
            holder: ctx.accounts.holder.key(),
            nft_mint: record.mint_used,
            access_count: record.access_count,
        });

        Ok(())
    }

    pub fn re_access(ctx: Context<ReAccess>) -> Result<()> {
        require!(ctx.accounts.holder_token_account.amount >= 1, GateError::NoNftHeld);

        let gate = &mut ctx.accounts.gate;
        gate.total_accesses = gate.total_accesses.checked_add(1).ok_or(GateError::Overflow)?;

        let record = &mut ctx.accounts.access_record;
        record.access_count = record.access_count.checked_add(1).ok_or(GateError::Overflow)?;

        emit!(AccessGranted {
            gate: gate.key(),
            holder: ctx.accounts.holder.key(),
            nft_mint: ctx.accounts.holder_token_account.mint,
            access_count: record.access_count,
        });

        Ok(())
    }

    pub fn revoke_access(ctx: Context<RevokeAccess>) -> Result<()> {
        let holder = ctx.accounts.access_record.wallet;
        let gate_key = ctx.accounts.gate.key();

        let record = &mut ctx.accounts.access_record;
        record.access_count = 0;

        emit!(AccessRevoked {
            gate: gate_key,
            authority: ctx.accounts.authority.key(),
            holder,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateGate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub required_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = authority, space = 8 + Gate::INIT_SPACE,
        seeds = [b"gate", authority.key().as_ref(), required_mint.key().as_ref()], bump)]
    pub gate: Account<'info, Gate>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Access<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(mut)]
    pub gate: Account<'info, Gate>,
    #[account(constraint = holder_token_account.mint == gate.required_mint,
        constraint = holder_token_account.owner == holder.key())]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = holder, space = 8 + AccessRecord::INIT_SPACE,
        seeds = [b"access", gate.key().as_ref(), holder.key().as_ref()], bump)]
    pub access_record: Account<'info, AccessRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReAccess<'info> {
    pub holder: Signer<'info>,
    #[account(mut)]
    pub gate: Account<'info, Gate>,
    #[account(constraint = holder_token_account.mint == gate.required_mint,
        constraint = holder_token_account.owner == holder.key())]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"access", gate.key().as_ref(), holder.key().as_ref()], bump = access_record.bump,
        has_one = gate)]
    pub access_record: Account<'info, AccessRecord>,
}

#[derive(Accounts)]
pub struct RevokeAccess<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority)]
    pub gate: Account<'info, Gate>,
    #[account(mut, has_one = gate, close = authority)]
    pub access_record: Account<'info, AccessRecord>,
}

#[account]
#[derive(InitSpace)]
pub struct Gate {
    pub authority: Pubkey,
    pub required_mint: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub total_accesses: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AccessRecord {
    pub gate: Pubkey,
    pub wallet: Pubkey,
    pub mint_used: Pubkey,
    pub first_access: i64,
    pub access_count: u64,
    pub bump: u8,
}

#[event]
pub struct GateCreated {
    pub gate: Pubkey,
    pub authority: Pubkey,
    pub required_collection: Pubkey,
}

#[event]
pub struct AccessGranted {
    pub gate: Pubkey,
    pub holder: Pubkey,
    pub nft_mint: Pubkey,
    pub access_count: u64,
}

#[event]
pub struct AccessRevoked {
    pub gate: Pubkey,
    pub authority: Pubkey,
    pub holder: Pubkey,
}

#[error_code]
pub enum GateError {
    #[msg("Name too long (max 32)")]
    NameTooLong,
    #[msg("No NFT held for this gate")]
    NoNftHeld,
    #[msg("Overflow")]
    Overflow,
}
