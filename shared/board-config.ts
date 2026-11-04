import type {
  ColorGroup,
  OwnableSpace,
  PropertySpace,
  Space,
  TransitSpace,
  UtilitySpace,
} from './game-types';

// Original 40-space Indian board. Positions run clockwise 0..39.
// Prices/rents are a tunable starting point; tower rents are deliberately aggressive (see docs/rules.md).

const p = (
  id: number,
  city: string,
  landmark: string,
  group: ColorGroup,
  price: number,
  rent: PropertySpace['rent'],
  buildCost: number,
  art: PropertySpace['landmark'],
): PropertySpace => ({
  id,
  type: 'PROPERTY',
  name: `${city} – ${landmark}`,
  short: city,
  city,
  group,
  price,
  rent,
  buildCost,
  landmark: art,
});

const transit = (id: number, name: string, short: string): TransitSpace => ({
  id,
  type: 'TRANSIT',
  name,
  short,
  price: 2000,
  rent: [250, 500, 1000, 2000],
});

const utility = (id: number, name: string, short: string): UtilitySpace => ({
  id,
  type: 'UTILITY',
  name,
  short,
  price: 1500,
  multipliers: [40, 100],
});

export const BOARD: readonly Space[] = [
  { id: 0, type: 'START', name: 'START', short: 'Start' },
  p(1, 'Jaipur', 'MI Road', 'terracotta', 600, [20, 100, 300, 900, 1600, 2500], 500, 'palace'),
  { id: 2, type: 'CARD', deck: 'CIVIC', name: 'Civic Chest', short: 'Civic' },
  p(3, 'Jodhpur', 'Clock Tower', 'terracotta', 600, [40, 200, 600, 1800, 3200, 4500], 500, 'tower'),
  { id: 4, type: 'TAX', name: 'GST Checkpost', short: 'GST', amount: 2000 },
  transit(5, 'Mumbai Local', 'Mumbai Local'),
  p(6, 'Patna', 'Golghar', 'sky', 1000, [60, 300, 900, 2700, 4000, 5500], 500, 'temple'),
  { id: 7, type: 'CARD', deck: 'FORTUNE', name: 'Fortune', short: 'Fortune' },
  p(8, 'Bhopal', 'Upper Lake', 'sky', 1000, [60, 300, 900, 2700, 4000, 5500], 500, 'ghat'),
  p(9, 'Lucknow', 'Hazratganj', 'sky', 1200, [80, 400, 1000, 3000, 4500, 6000], 500, 'gate'),
  { id: 10, type: 'JAIL', name: 'Jail / Just Visiting', short: 'Jail' },
  p(11, 'Varanasi', 'Dashashwamedh Ghat', 'rose', 1400, [100, 500, 1500, 4500, 6250, 7500], 1000, 'ghat'),
  utility(12, 'Power Grid', 'Power'),
  p(13, 'Coimbatore', 'Race Course', 'rose', 1400, [100, 500, 1500, 4500, 6250, 7500], 1000, 'temple'),
  p(14, 'Visakhapatnam', 'RK Beach', 'rose', 1600, [120, 600, 1800, 5000, 7000, 9000], 1000, 'beach'),
  transit(15, 'Delhi Metro', 'Delhi Metro'),
  p(16, 'Indore', 'Rajwada', 'saffron', 1800, [140, 700, 2000, 5500, 7500, 9500], 1000, 'palace'),
  { id: 17, type: 'CARD', deck: 'CIVIC', name: 'Civic Chest', short: 'Civic' },
  p(18, 'Nagpur', 'Zero Mile', 'saffron', 1800, [140, 700, 2000, 5500, 7500, 9500], 1000, 'tower'),
  p(19, 'Chandigarh', 'Sector 17', 'saffron', 2000, [160, 800, 2200, 6000, 8000, 10000], 1000, 'skyline'),
  { id: 20, type: 'REST_HOUSE', name: 'Rest House', short: 'Rest House' },
  p(21, 'Kochi', 'Fort Kochi', 'crimson', 2200, [180, 900, 2500, 7000, 8750, 10500], 1500, 'beach'),
  { id: 22, type: 'CARD', deck: 'FORTUNE', name: 'Fortune', short: 'Fortune' },
  p(23, 'Surat', 'Diamond Market', 'crimson', 2200, [180, 900, 2500, 7000, 8750, 10500], 1500, 'skyline'),
  p(24, 'Ahmedabad', 'Sabarmati Riverfront', 'crimson', 2400, [200, 1000, 3000, 7500, 9250, 11000], 1500, 'bridge'),
  transit(25, 'Kolkata Tram', 'Kolkata Tram'),
  p(26, 'Pune', 'Shaniwar Wada', 'turmeric', 2600, [220, 1100, 3300, 8000, 9750, 11500], 1500, 'fort'),
  p(27, 'Goa', 'Panaji', 'turmeric', 2600, [220, 1100, 3300, 8000, 9750, 11500], 1500, 'beach'),
  utility(28, 'Jal Board', 'Water'),
  p(29, 'Kolkata', 'Howrah Bridge', 'turmeric', 2800, [240, 1200, 3600, 8500, 10250, 12000], 1500, 'bridge'),
  { id: 30, type: 'GO_TO_JAIL', name: 'Go To Jail', short: 'Go To Jail' },
  p(31, 'Hyderabad', 'Charminar', 'emerald', 3000, [260, 1300, 3900, 9000, 11000, 12750], 2000, 'gate'),
  p(32, 'Chennai', 'Marina Beach', 'emerald', 3000, [260, 1300, 3900, 9000, 11000, 12750], 2000, 'beach'),
  { id: 33, type: 'CARD', deck: 'CIVIC', name: 'Civic Chest', short: 'Civic' },
  p(34, 'Bengaluru', 'MG Road', 'emerald', 3200, [280, 1500, 4500, 10000, 12000, 14000], 2000, 'skyline'),
  transit(35, 'Vande Bharat Express', 'Vande Bharat'),
  { id: 36, type: 'CARD', deck: 'FORTUNE', name: 'Fortune', short: 'Fortune' },
  p(37, 'Delhi', 'Connaught Place', 'indigo', 3500, [350, 1750, 5000, 11000, 13000, 15000], 2000, 'gate'),
  { id: 38, type: 'TAX', name: 'Infrastructure Levy', short: 'Levy', amount: 1000 },
  p(39, 'Mumbai', 'Marine Drive', 'indigo', 4000, [500, 2000, 6000, 14000, 17000, 20000], 2000, 'skyline'),
];

export const BOARD_SIZE = BOARD.length;

export const GROUP_META: Record<ColorGroup, { label: string; color: string }> = {
  terracotta: { label: 'Terracotta', color: '#9a4a2c' },
  sky: { label: 'Sky', color: '#5aa7d6' },
  rose: { label: 'Rose', color: '#c8558a' },
  saffron: { label: 'Saffron', color: '#e8892b' },
  crimson: { label: 'Crimson', color: '#c0392b' },
  turmeric: { label: 'Turmeric', color: '#d9b72b' },
  emerald: { label: 'Emerald', color: '#1f8a5b' },
  indigo: { label: 'Indigo', color: '#2b3a8f' },
};

export function getSpace(id: number): Space {
  const space = BOARD[id];
  if (!space) throw new Error(`Unknown space ${id}`);
  return space;
}

export function isOwnable(space: Space): space is OwnableSpace {
  return space.type === 'PROPERTY' || space.type === 'TRANSIT' || space.type === 'UTILITY';
}

export const OWNABLE_IDS: readonly number[] = BOARD.filter(isOwnable).map((s) => s.id);

export function groupSpaceIds(group: ColorGroup): number[] {
  return BOARD.filter((s): s is PropertySpace => s.type === 'PROPERTY' && s.group === group).map((s) => s.id);
}

/** Validates the board at module load so a bad config fails fast in tests and builds. */
export function validateBoard(board: readonly Space[] = BOARD): string[] {
  const errors: string[] = [];
  if (board.length !== 40) errors.push(`Board must have 40 spaces, has ${board.length}`);
  board.forEach((s, i) => {
    if (s.id !== i) errors.push(`Space at index ${i} has id ${s.id}`);
    if (s.type === 'PROPERTY') {
      if (s.price <= 0 || s.buildCost <= 0) errors.push(`${s.name}: invalid price`);
      for (let k = 1; k < s.rent.length; k++)
        if (s.rent[k] <= s.rent[k - 1]) errors.push(`${s.name}: rents must increase`);
    }
  });
  const props = board.filter((s) => s.type === 'PROPERTY');
  const transits = board.filter((s) => s.type === 'TRANSIT');
  const utils = board.filter((s) => s.type === 'UTILITY');
  if (props.length !== 22) errors.push(`Expected 22 properties, got ${props.length}`);
  if (transits.length !== 4) errors.push(`Expected 4 transit spaces, got ${transits.length}`);
  if (utils.length !== 2) errors.push(`Expected 2 utilities, got ${utils.length}`);
  if (board[10]?.type !== 'JAIL') errors.push('Space 10 must be Jail');
  if (board[30]?.type !== 'GO_TO_JAIL') errors.push('Space 30 must be Go To Jail');
  return errors;
}
