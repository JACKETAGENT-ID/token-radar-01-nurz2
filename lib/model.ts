// Token Radar v2 — the strict-value model (nurz).
//
// Every ranked row is a protocol that records no token (mcap_usd, gecko_id and
// symbol are all null), is not a CEX and is not a versioned pool — and is not
// a wrapped, staked or bridged product of a protocol whose token already
// trades (the watchlist's own rule: a Bridge / Liquid Staking / Liquid
// Restaking / Restaked BTC category, a name carrying a whole word wrapped,
// staked or staking, or a name beginning with an exchange's name). WBTC,
// Binance staked ETH and USDT0 are therefore never ranked: their token
// already trades, so there is no launch left to value. Protocols whose token
// already trades are never ranked either: they are shown apart, in the
// dashboard's Live section, at the market's own capitalisation.
//
// Implied value is computed only from the snapshot's own figures — TVL,
// seven-day change, age since listed_at, category and chain count. No protocol
// name is ever special-cased; the same function scores every row:
//
//   implied = TVL x categoryMultiple x chainMult x growthMult x maturityMult
//
//   categoryMultiple  by category band (dashboard shows the whole table):
//                     HIGH 0.32 (Dexs, Derivatives, Prediction Market),
//                     MID-HIGH 0.28 (Lending, CDP, Payments, Collateral Markets),
//                     MID 0.25 (Yield, RWA, Risk Curators, Allocators, ...),
//                     LOW 0.22 (Staking, Insurance, Privacy, Indexes, ...),
//                     FLOOR 0.18 (Chain, Bridge, Liquid Staking, ...),
//                     UNKNOWN 0.20 (no category recorded)
//   chainMult         1 + 0.02 x min(chains - 1, 10)          (1.00 .. 1.20)
//   growthMult        1 + clamp(change_7d, -50, +80) / 100 x 0.7
//                     (change_7d null counts as 0: no growth claimed)
//   maturityMult      age null -> 0.85; else 0.70 + 0.30 x min(age, 1095) / 1095
//                     (young protocols are discounted: unproven record)
//
// A farm plan is derived from the same record (category, main chain, TVL
// tier, age): capital, hold length and the concrete action all follow from it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard's methodology panel. */
export interface ModelConstants {
  band_high: number;
  band_mid_high: number;
  band_mid: number;
  band_low: number;
  band_floor: number;
  band_unknown: number;
  chain_step: number;
  chain_max_extra: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_multiplier: number;
}

export const MODEL: ModelConstants = {
  band_high: 0.32,
  band_mid_high: 0.28,
  band_mid: 0.25,
  band_low: 0.22,
  band_floor: 0.18,
  band_unknown: 0.2,
  chain_step: 0.02,
  chain_max_extra: 10,
  growth_weight: 0.7,
  growth_floor: -50,
  growth_cap: 80,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_multiplier: 0.85,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2-strict';

/** How many live-token protocols the Live (already trading) view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  confidence: 'high' | 'medium' | 'early';
  implied_value_usd: number;
  model: {
    category_band: string;
    category_multiple: number;
    chain_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    implied_per_tvl: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  confidence: 'high' | 'medium' | 'early';
  category_band: string;
  category_multiple: number;
  chain_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_per_tvl: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category band a protocol's category falls in, with its multiple. */
export function categoryBand(category: string | null, model: ModelConstants): { band: string; multiple: number } {
  const c = category ?? '';
  if (c === 'Dexs' || c === 'Derivatives' || c === 'Prediction Market') return { band: 'HIGH', multiple: model.band_high };
  if (c === 'Lending' || c === 'CDP' || c === 'Payments' || c === 'Collateral Markets') return { band: 'MID-HIGH', multiple: model.band_mid_high };
  if (
    c === 'Yield' || c === 'Yield Aggregator' || c === 'RWA' || c === 'Basis Trading' ||
    c === 'Risk Curators' || c === 'Onchain Capital Allocator' || c === 'Leveraged Farming' ||
    c === 'Liquidity Manager' || c === 'Farm' || c === 'Options Vault' ||
    c === 'Interest Rate Derivatives' || c === 'CDP Manager' || c === 'Uncollateralized Lending'
  ) return { band: 'MID', multiple: model.band_mid };
  if (
    c === 'Staking Pool' || c === 'Restaking' || c === 'Insurance' || c === 'Privacy' ||
    c === 'Indexes' || c === 'Governance Incentives' || c === 'OTC Marketplace' || c === 'CeDeFi' ||
    c === 'Dual-Token Stablecoin' || c === 'Stablecoin Wrapper' || c === 'Decentralized BTC' || c === 'Anchor BTC'
  ) return { band: 'LOW', multiple: model.band_low };
  if (
    c === 'Chain' || c === 'Bridge' || c === 'Canonical Bridge' || c === 'Cross Chain Bridge' ||
    c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC' ||
    c === 'CEX' || c === 'Crypto Card Issuer'
  ) return { band: 'FLOOR', multiple: model.band_floor };
  return { band: 'UNKNOWN', multiple: model.band_unknown };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; band: string; catMult: number; chainMult: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { band, multiple: catMult } = categoryBand(protocol.category, model);
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const chainMult = 1 + model.chain_step * extraChains;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    age === null ? model.unknown_age_multiplier : model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * chainMult * growthMult * maturityMult));
  return { implied, band, catMult, chainMult, growthPct, growthMult, maturityMult, age };
}

/** How much the record itself supports the implied value: age, a reported 7d change and chain spread. */
export function confidenceFor(age: number | null, change7d: number | null, chains: number): 'high' | 'medium' | 'early' {
  if (age !== null && age >= 365 && change7d !== null && chains >= 3) return 'high';
  if (age !== null && age >= 120) return 'medium';
  return 'early';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The watchlist's own product rule: categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** A name carrying a whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol is a wrapped, staked or bridged product of a token that already trades. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  return (
    WRAPPED_CATEGORIES.has(p.category ?? '') ||
    EXCHANGE_PREFIX.test(p.name) ||
    WRAPPED_WORD.test(p.name) ||
    VERSIONED.test(p.name)
  );
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped/staked/bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  // Every rankable pre-token protocol is ranked — the watchlist is the floor,
  // never the ceiling, so the board also carries the early ones below it.
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const conf = confidenceFor(s.v.age, s.p.change_7d, s.p.chains.length);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.v.age,
      token_status: 'pre-token',
      watchlist: watchlist.has(s.p.slug),
      confidence: conf,
      implied_value_usd: s.v.implied,
      model: {
        category_band: s.v.band,
        category_multiple: s.v.catMult,
        chain_multiplier: round4(s.v.chainMult),
        growth_pct: round4(s.v.growthPct),
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
        implied_per_tvl: round4(s.v.implied / Math.max(1, s.p.tvl_usd)),
      },
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 80;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 75;
  if (age < 365) return 45;
  return 30;
}

/** The category's concrete action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral, borrow a small amount against it, then repay the borrow so the wallet shows both sides of the market.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} in equal halves, and keep the LP position open instead of removing it after a day.`;
  if (c.includes('derivative') || c.includes('basis') || c.includes('options') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small hedged position, and close it only after the position has sat for a full week.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside an app on ${chain} so the transfer is not a bare pass-through.`;
  if (c.includes('stak') || c.includes('restak') || c.includes('anchor btc') || c.includes('decentralized btc')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token in the same wallet for the whole farming window.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} on ${chain} and place one real market position, then settle or close it rather than leaving the funds idle.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet so the holding is visible on-chain.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a curated ${name} vault on ${chain} and keep the vault shares; do not chase the vault with the highest advertised yield alone.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('liquidity manager') || c.includes('aggregator')) return `Deposit $${capital} into ${name}'s main yield vault or pool on ${chain}, claim the rewards once, and re-deposit them instead of selling them at once.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a position you already hold, and keep the policy active for the full farming window.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name} on ${chain} and spend a small part of it through the protocol's own payment flow, keeping the rest in the account.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s private pool on ${chain} and withdraw it only after the protocol's own minimum holding period has passed.`;
  if (c.includes('stable') || c.includes('dual-token')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it, or provide it as liquidity to the protocol's own stable pool.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain, use two of its native apps, and keep a balance on the chain for the whole farming window.`;
  if (c.includes('index') || c.includes('governance') || c.includes('cedefi') || c.includes('otc')) return `Deposit $${capital} into ${name}'s index or vault product on ${chain} and keep the receipt, voting once if the protocol opens a governance vote.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full farming window.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * Every figure in it comes from the protocol's own record (category, chain,
 * TVL tier, age) — never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 200 ? 10 : capital >= 120 ? 8 : 5;
  return [
    {
      text: `Open a fresh wallet used only for farming ${p.name}, fund it with $${capital} plus about $10 for gas, and store its seed phrase offline, never in a screenshot or a chat.`,
      cost: 'about $10 of gas to fund and set up',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Within the first week, make a second, different on-chain action on ${p.name} — a swap, a borrow, a vote or a second deposit — so the wallet shows repeat use, not one deposit.`,
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Keep the $${capital} position open for at least ${hold} days, checking the protocol's own points or rewards page once a week, so the activity spans more than one snapshot window.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Repeat one small qualifying action every week — top up, re-stake the rewards or vote — and keep each transaction hash in a farm log with the date.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `When a claim opens, use only the link the protocol itself publishes, never pay a fee to claim, and check the token contract against the protocol's own announcement before signing anything.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates, the amounts and every transaction hash, and plan the exit before withdrawing: unwind in one transaction, keep a little gas on ${chain}, and leave only after the snapshot you farmed for has passed.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    confidence: row.confidence,
    category_band: row.model.category_band,
    category_multiple: row.model.category_multiple,
    chain_multiplier: row.model.chain_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    implied_per_tvl: row.model.implied_per_tvl,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
