use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;

declare_id!("8kNH8KYr2c6karBWHUcSos3qWyWC4eWQ91Pr7M9onsdh");

#[program]
pub mod decentra_voice_mvp {
    use super::*;

    pub fn create_channel(
        ctx: Context<CreateChannel>,
        name: String,
    ) -> Result<String> {
        let channel = &mut ctx.accounts.channel;
        let clock = Clock::get()?;
        
        // Generate human-friendly 8-character channel ID
        let channel_id = generate_channel_id(&clock.unix_timestamp);
        
        // Store channel info
        channel.id = channel_id.clone();
        channel.name = name;
        channel.creator = ctx.accounts.user.key();
        channel.created_at = clock.unix_timestamp;
        channel.active = true;
        channel.participant_count = 0;
        
        msg!("Channel created: {} ({})", channel.name, channel.id);
        
        Ok(channel_id)
    }
    
    pub fn join_channel(
        ctx: Context<JoinChannel>,
    ) -> Result<ChannelInfo> {
        let channel = &mut ctx.accounts.channel;
        
        require!(channel.active, ChannelError::ChannelInactive);
        
        // Update participant count
        channel.participant_count += 1;
        
        let channel_info = ChannelInfo {
            id: channel.id.clone(),
            name: channel.name.clone(),
            creator: channel.creator,
            created_at: channel.created_at,
            participant_count: channel.participant_count,
            active: channel.active,
        };
        
        msg!("User joined channel: {} ({})", channel.name, channel.id);
        
        Ok(channel_info)
    }
    
    pub fn leave_channel(
        ctx: Context<LeaveChannel>,
    ) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        
        // Decrease participant count
        if channel.participant_count > 0 {
            channel.participant_count -= 1;
        }
        
        msg!("User left channel: {} ({})", channel.name, channel.id);
        
        Ok(())
    }
    
    pub fn get_channel_info(
        ctx: Context<GetChannelInfo>,
    ) -> Result<ChannelInfo> {
        let channel = &ctx.accounts.channel;
        
        let channel_info = ChannelInfo {
            id: channel.id.clone(),
            name: channel.name.clone(),
            creator: channel.creator,
            created_at: channel.created_at,
            participant_count: channel.participant_count,
            active: channel.active,
        };
        
        Ok(channel_info)
    }
}

// Helper function to generate human-friendly channel IDs
fn generate_channel_id(timestamp: &i64) -> String {
    // Use timestamp and some randomness to create IDs like "CHAT-1A2B"
    let suffix = format!("{:X}", timestamp % 0xFFFF);
    format!("CHAT-{}", &suffix[suffix.len().saturating_sub(4)..])
}

#[derive(Accounts)]
pub struct CreateChannel<'info> {
    #[account(init, payer = user, space = 8 + 64 + 256 + 32 + 8 + 1 + 4)]
    pub channel: Account<'info, Channel>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinChannel<'info> {
    #[account(mut)]
    pub channel: Account<'info, Channel>,
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct LeaveChannel<'info> {
    #[account(mut)]
    pub channel: Account<'info, Channel>,
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetChannelInfo<'info> {
    pub channel: Account<'info, Channel>,
}

#[account]
pub struct Channel {
    pub id: String,           // 64 bytes - human-friendly ID like "CHAT-1A2B"
    pub name: String,         // 256 bytes - human readable name
    pub creator: Pubkey,      // 32 bytes - who created it
    pub created_at: i64,      // 8 bytes - timestamp
    pub active: bool,         // 1 byte - is channel active
    pub participant_count: u32, // 4 bytes - current participants
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub creator: Pubkey,
    pub created_at: i64,
    pub participant_count: u32,
    pub active: bool,
}

#[error_code]
pub enum ChannelError {
    #[msg("Channel is not active")]
    ChannelInactive,
    #[msg("Channel is full")]
    ChannelFull,
    #[msg("Unauthorized access")]
    Unauthorized,
}
