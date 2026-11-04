import type { CardDef, DeckId } from './game-types';

// Original card text. Amounts and movement are configuration, not code.
export const CARDS: readonly CardDef[] = [
  // Fortune
  { id: 'F01', deck: 'FORTUNE', text: 'Your startup wins a national pitch contest. Collect ₹2,000.', effect: { type: 'COLLECT', amount: 2000 } },
  { id: 'F02', deck: 'FORTUNE', text: 'Caught jumping a red light. Pay a ₹500 traffic fine.', effect: { type: 'PAY', amount: 500 } },
  { id: 'F03', deck: 'FORTUNE', text: 'Take the overnight train to Chennai.', effect: { type: 'ADVANCE_TO', spaceId: 32 } },
  { id: 'F04', deck: 'FORTUNE', text: 'Monsoon damage! Pay ₹250 per block and ₹1,000 per tower for repairs.', effect: { type: 'REPAIRS', perBlock: 250, perTower: 1000 } },
  { id: 'F05', deck: 'FORTUNE', text: 'Head straight back to START.', effect: { type: 'ADVANCE_TO', spaceId: 0 } },
  { id: 'F06', deck: 'FORTUNE', text: 'Weekend trip to Mumbai – Marine Drive.', effect: { type: 'ADVANCE_TO', spaceId: 39 } },
  { id: 'F07', deck: 'FORTUNE', text: 'Catch the nearest train. Pay the owner the usual fare.', effect: { type: 'NEAREST', spaceType: 'TRANSIT' } },
  { id: 'F08', deck: 'FORTUNE', text: 'Your power bill is due – go to the nearest utility.', effect: { type: 'NEAREST', spaceType: 'UTILITY' } },
  { id: 'F09', deck: 'FORTUNE', text: 'Wrong turn in traffic. Go back 3 spaces.', effect: { type: 'MOVE_BY', steps: -3 } },
  { id: 'F10', deck: 'FORTUNE', text: 'Tax raid! Go directly to Jail. Do not pass START.', effect: { type: 'GO_TO_JAIL' } },
  { id: 'F11', deck: 'FORTUNE', text: 'A friend in the courts owes you one. Get Out of Jail Free – keep this card.', effect: { type: 'JAIL_FREE' } },
  { id: 'F12', deck: 'FORTUNE', text: 'Dividend from your chai franchise. Collect ₹1,500.', effect: { type: 'COLLECT', amount: 1500 } },
  { id: 'F13', deck: 'FORTUNE', text: 'Visit Hyderabad – Charminar.', effect: { type: 'ADVANCE_TO', spaceId: 31 } },
  { id: 'F14', deck: 'FORTUNE', text: 'Pay property maintenance charges of ₹1,000.', effect: { type: 'PAY', amount: 1000 } },
  { id: 'F15', deck: 'FORTUNE', text: 'Ride the Delhi Metro.', effect: { type: 'ADVANCE_TO', spaceId: 15 } },
  { id: 'F16', deck: 'FORTUNE', text: 'Your cricket bet with the bank pays off. Collect ₹500.', effect: { type: 'COLLECT', amount: 500 } },
  // Civic Chest
  { id: 'C01', deck: 'CIVIC', text: 'Festival bonus! Collect ₹1,000.', effect: { type: 'COLLECT', amount: 1000 } },
  { id: 'C02', deck: 'CIVIC', text: 'Medical expenses. Pay ₹800.', effect: { type: 'PAY', amount: 800 } },
  { id: 'C03', deck: 'CIVIC', text: 'Income tax refund. Collect ₹1,500.', effect: { type: 'COLLECT', amount: 1500 } },
  { id: 'C04', deck: 'CIVIC', text: 'Advance to START.', effect: { type: 'ADVANCE_TO', spaceId: 0 } },
  { id: 'C05', deck: 'CIVIC', text: 'School fees for the new term. Pay ₹1,000.', effect: { type: 'PAY', amount: 1000 } },
  { id: 'C06', deck: 'CIVIC', text: 'Your fixed deposit matures. Collect ₹1,000.', effect: { type: 'COLLECT', amount: 1000 } },
  { id: 'C07', deck: 'CIVIC', text: 'Municipal inspection. Pay ₹400 per block and ₹1,150 per tower.', effect: { type: 'REPAIRS', perBlock: 400, perTower: 1150 } },
  { id: 'C08', deck: 'CIVIC', text: 'Building permit irregularity. Go directly to Jail.', effect: { type: 'GO_TO_JAIL' } },
  { id: 'C09', deck: 'CIVIC', text: 'Get Out of Jail Free. Keep this card until needed.', effect: { type: 'JAIL_FREE' } },
  { id: 'C10', deck: 'CIVIC', text: 'You win second prize at the rangoli competition. Collect ₹100.', effect: { type: 'COLLECT', amount: 100 } },
  { id: 'C11', deck: 'CIVIC', text: 'Inheritance from a distant relative. Collect ₹1,000.', effect: { type: 'COLLECT', amount: 1000 } },
  { id: 'C12', deck: 'CIVIC', text: 'Hospital donation drive. Pay ₹500.', effect: { type: 'PAY', amount: 500 } },
  { id: 'C13', deck: 'CIVIC', text: 'Consultancy fee received. Collect ₹250.', effect: { type: 'COLLECT', amount: 250 } },
  { id: 'C14', deck: 'CIVIC', text: 'Insurance policy matures. Collect ₹1,000.', effect: { type: 'COLLECT', amount: 1000 } },
  { id: 'C15', deck: 'CIVIC', text: 'Bank error in your favour. Collect ₹2,000.', effect: { type: 'COLLECT', amount: 2000 } },
  { id: 'C16', deck: 'CIVIC', text: 'Wedding gift for a cousin. Pay ₹500.', effect: { type: 'PAY', amount: 500 } },
];

export const DECK_LABEL: Record<DeckId, string> = { FORTUNE: 'Fortune', CIVIC: 'Civic Chest' };

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
}

export function deckCardIds(deck: DeckId): string[] {
  return CARDS.filter((c) => c.deck === deck).map((c) => c.id);
}
