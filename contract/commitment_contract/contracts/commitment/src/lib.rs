#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    token, Address, Env, Map, Symbol,
};

/// ----------------------------
/// Data model
/// ----------------------------

#[contracttype]
#[derive(Clone)]
pub struct Tier {
    pub lock_secs: u64,      // 90 days in seconds
    pub payout_now: i128,    // 20 tokens (scaled by token decimals)
    pub payout_early: i128,  // 15 tokens
    pub payout_mature: i128, // 35 tokens
}

#[contracttype]
#[derive(Clone)]
pub struct UserState {
    pub eligible: bool,
    pub tier_id: u32,
    pub locked_at: u64,
    pub unlock_at: u64,
    pub claimed_now: bool,
    pub locked: bool,
    pub withdrawn: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Token, // Soroban token contract address (mock USDC)
    Tiers, // Map<u32, Tier>
    Users, // Map<Address, UserState>
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Err {
    NotAdmin = 1,
    NotEligible = 2,
    AlreadyFinalized = 3, // claimed_now OR locked OR withdrawn
    NotLocked = 4,
    AlreadyWithdrawn = 5,
    TierNotFound = 6,
    NotInitialized = 7,
    AlreadyInitialized = 8,
}

#[contract]
pub struct Commitment;

fn ensure_initialized(e: &Env) -> Result<(), Err> {
    if e.storage().instance().has(&DataKey::Admin) && e.storage().instance().has(&DataKey::Token) {
        Ok(())
    } else {
        Err(Err::NotInitialized)
    }
}

fn get_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("ADMIN_NOT_SET"))
}

fn get_token(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic!("TOKEN_NOT_SET"))
}

fn get_tiers(e: &Env) -> Map<u32, Tier> {
    e.storage()
        .instance()
        .get(&DataKey::Tiers)
        .unwrap_or(Map::new(e))
}

fn set_tiers(e: &Env, tiers: &Map<u32, Tier>) {
    e.storage().instance().set(&DataKey::Tiers, tiers);
}

fn get_users(e: &Env) -> Map<Address, UserState> {
    e.storage()
        .instance()
        .get(&DataKey::Users)
        .unwrap_or(Map::new(e))
}

fn set_users(e: &Env, users: &Map<Address, UserState>) {
    e.storage().instance().set(&DataKey::Users, users);
}

fn default_user(e: &Env) -> UserState {
    UserState {
        eligible: false,
        tier_id: 0,
        locked_at: 0,
        unlock_at: 0,
        claimed_now: false,
        locked: false,
        withdrawn: false,
    }
}

#[contractimpl]
impl Commitment {
    /// Initialize contract once:
    /// - admin controls eligibility and tiers
    /// - token_addr is the Soroban token contract used for payouts (mock USDC)
    pub fn init(e: Env, admin: Address, token_addr: Address) -> Result<(), Err> {
        if e.storage().instance().has(&DataKey::Admin) {
            return Err(Err::AlreadyInitialized);
        }

        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Token, &token_addr);

        // Default Tier 1:
        // 90 days lock, 20 now, 15 early, 35 mature
        // Amounts assume 7 decimals (like Stellar asset contracts often use in demos).
        let mut tiers = Map::<u32, Tier>::new(&e);
        tiers.set(
            1u32,
            Tier {
                lock_secs: 90u64 * 24u64 * 60u64 * 60u64,
                payout_now: 20_0000000i128,
                payout_early: 15_0000000i128,
                payout_mature: 35_0000000i128,
            },
        );
        set_tiers(&e, &tiers);

        set_users(&e, &Map::new(&e));

        e.events()
            .publish((Symbol::new(&e, "init"),), (admin, token_addr));
        Ok(())
    }

    /// Admin can add/update a tier.
    pub fn admin_set_tier(e: Env, tier_id: u32, tier: Tier) -> Result<(), Err> {
        ensure_initialized(&e)?;
        let admin = get_admin(&e);
        admin.require_auth();

        let mut tiers = get_tiers(&e);
        tiers.set(tier_id, tier);
        set_tiers(&e, &tiers);

        e.events()
            .publish((Symbol::new(&e, "tier_set"),), tier_id);
        Ok(())
    }

    /// Admin marks user eligible (course completed) and assigns a tier.
    pub fn admin_set_eligible(e: Env, user: Address, tier_id: u32) -> Result<(), Err> {
        ensure_initialized(&e)?;
        let admin = get_admin(&e);
        admin.require_auth();

        let tiers = get_tiers(&e);
        if tiers.get(tier_id).is_none() {
            return Err(Err::TierNotFound);
        }

        let mut users = get_users(&e);
        let existing = users.get(user.clone());

        let state = match existing {
            Some(mut s) => {
                s.eligible = true;
                s.tier_id = tier_id;
                s
            }
            None => UserState {
                eligible: true,
                tier_id,
                ..default_user(&e)
            },
        };

        users.set(user.clone(), state);
        set_users(&e, &users);

        e.events()
            .publish((Symbol::new(&e, "eligible_set"),), user);
        Ok(())
    }

    /// Read user state (frontend will call this).
    pub fn get_user(e: Env, user: Address) -> Result<UserState, Err> {
        ensure_initialized(&e)?;
        let users = get_users(&e);
        Ok(users.get(user).unwrap_or_else(|| default_user(&e)))
    }

    /// User claims the "now" payout (20).
    /// After claiming now, they are finished (withdrawn = true).
    pub fn claim_now(e: Env, user: Address) -> Result<i128, Err> {
        ensure_initialized(&e)?;
        user.require_auth();

        let mut users = get_users(&e);
        let mut s = users.get(user.clone()).ok_or(Err::NotEligible)?;

        if !s.eligible {
            return Err(Err::NotEligible);
        }
        if s.claimed_now || s.locked || s.withdrawn {
            return Err(Err::AlreadyFinalized);
        }

        let tiers = get_tiers(&e);
        let tier = tiers.get(s.tier_id).ok_or(Err::TierNotFound)?;

        let token_addr = get_token(&e);
        let t = token::Client::new(&e, &token_addr);
        t.transfer(&e.current_contract_address(), &user, &tier.payout_now);

        s.claimed_now = true;
        s.withdrawn = true;
        users.set(user.clone(), s);
        set_users(&e, &users);

        e.events()
            .publish((Symbol::new(&e, "claim_now"),), user);
        Ok(tier.payout_now)
    }

    /// User locks into the tier for lock_secs (90 days).
    pub fn lock(e: Env, user: Address) -> Result<u64, Err> {
        ensure_initialized(&e)?;
        user.require_auth();

        let mut users = get_users(&e);
        let mut s = users.get(user.clone()).ok_or(Err::NotEligible)?;

        if !s.eligible {
            return Err(Err::NotEligible);
        }
        if s.claimed_now || s.locked || s.withdrawn {
            return Err(Err::AlreadyFinalized);
        }

        let tiers = get_tiers(&e);
        let tier = tiers.get(s.tier_id).ok_or(Err::TierNotFound)?;

        let now = e.ledger().timestamp();
        let unlock_at = now + tier.lock_secs;

        s.locked = true;
        s.locked_at = now;
        s.unlock_at = unlock_at;

        users.set(user.clone(), s);
        set_users(&e, &users);

        e.events()
            .publish((Symbol::new(&e, "locked"),), (user, unlock_at));
        Ok(unlock_at)
    }

    /// Withdraw:
    /// - if before unlock_at => early payout (15)
    /// - else => mature payout (35)
    pub fn withdraw(e: Env, user: Address) -> Result<i128, Err> {
        ensure_initialized(&e)?;
        user.require_auth();

        let mut users = get_users(&e);
        let mut s = users.get(user.clone()).ok_or(Err::NotEligible)?;

        if !s.eligible {
            return Err(Err::NotEligible);
        }
        if !s.locked {
            return Err(Err::NotLocked);
        }
        if s.withdrawn {
            return Err(Err::AlreadyWithdrawn);
        }

        let tiers = get_tiers(&e);
        let tier = tiers.get(s.tier_id).ok_or(Err::TierNotFound)?;

        let now = e.ledger().timestamp();
        let payout = if now < s.unlock_at {
            tier.payout_early
        } else {
            tier.payout_mature
        };

        let token_addr = get_token(&e);
        let t = token::Client::new(&e, &token_addr);
        t.transfer(&e.current_contract_address(), &user, &payout);

        s.withdrawn = true;
        users.set(user.clone(), s);
        set_users(&e, &users);

        e.events()
            .publish((Symbol::new(&e, "withdraw"),), (user, payout));
        Ok(payout)
    }
    pub fn admin_reset_user(e: Env, admin: Address, user: Address) {
    // auth: only admin
    let stored_admin = read_admin(&e);
    admin.require_auth();
    if admin != stored_admin {
        panic!("not admin");
    }

    let mut s = read_user(&e, &user);
    s.eligible = true;
    s.claimed_now = false;
    s.withdrawn = false;
    s.locked = false;
    s.locked_at = 0;
    s.unlock_at = 0;
    write_user(&e, &user, &s);
    }

}

