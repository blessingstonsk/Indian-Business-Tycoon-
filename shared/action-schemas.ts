import { z } from 'zod';

// Zod schemas for every payload crossing the client → backend trust boundary.

export const GAME_ACTION_TYPES = [
  'ROLL_DICE',
  'BUY_PROPERTY',
  'DECLINE_PROPERTY',
  'PLACE_BID',
  'PASS_BID',
  'PAY_BAIL',
  'TRY_DOUBLES',
  'USE_JAIL_CARD',
  'BUILD',
  'SELL_BUILDING',
  'MORTGAGE',
  'UNMORTGAGE',
  'PROPOSE_TRADE',
  'ACCEPT_TRADE',
  'REJECT_TRADE',
  'CANCEL_TRADE',
  'PAY_DEBT',
  'DECLARE_BANKRUPTCY',
  'END_TURN',
  'CLAIM_TIMEOUT',
  'RESIGN',
] as const;

export type GameActionType = (typeof GAME_ACTION_TYPES)[number];

const spaceId = z.number().int().min(0).max(39);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const empty = z.object({}).strict();

export const tradeSideSchema = z
  .object({
    cash: z.number().int().min(0).max(10_000_000),
    spaceIds: z.array(spaceId).max(28),
    jailCards: z.number().int().min(0).max(2),
  })
  .strict();

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL_DICE'), payload: empty }),
  z.object({ type: z.literal('BUY_PROPERTY'), payload: empty }),
  z.object({ type: z.literal('DECLINE_PROPERTY'), payload: empty }),
  z.object({ type: z.literal('PLACE_BID'), payload: z.object({ amount: z.number().int().min(1).max(10_000_000) }).strict() }),
  z.object({ type: z.literal('PASS_BID'), payload: empty }),
  z.object({ type: z.literal('PAY_BAIL'), payload: empty }),
  z.object({ type: z.literal('TRY_DOUBLES'), payload: empty }),
  z.object({ type: z.literal('USE_JAIL_CARD'), payload: empty }),
  z.object({ type: z.literal('BUILD'), payload: z.object({ spaceId }).strict() }),
  z.object({ type: z.literal('SELL_BUILDING'), payload: z.object({ spaceId }).strict() }),
  z.object({ type: z.literal('MORTGAGE'), payload: z.object({ spaceId }).strict() }),
  z.object({ type: z.literal('UNMORTGAGE'), payload: z.object({ spaceId }).strict() }),
  z.object({
    type: z.literal('PROPOSE_TRADE'),
    payload: z.object({ toUid: id, give: tradeSideSchema, get: tradeSideSchema }).strict(),
  }),
  z.object({ type: z.literal('ACCEPT_TRADE'), payload: z.object({ tradeId: id }).strict() }),
  z.object({ type: z.literal('REJECT_TRADE'), payload: z.object({ tradeId: id }).strict() }),
  z.object({ type: z.literal('CANCEL_TRADE'), payload: z.object({ tradeId: id }).strict() }),
  z.object({ type: z.literal('PAY_DEBT'), payload: empty }),
  z.object({ type: z.literal('DECLARE_BANKRUPTCY'), payload: empty }),
  z.object({ type: z.literal('END_TURN'), payload: empty }),
  z.object({ type: z.literal('CLAIM_TIMEOUT'), payload: empty }),
  z.object({ type: z.literal('RESIGN'), payload: empty }),
]);

export type GameAction = z.infer<typeof gameActionSchema>;

export const gameCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    roomId: id,
    gameId: id,
    expectedVersion: z.number().int().min(0),
    type: z.enum(GAME_ACTION_TYPES),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

export type GameCommand = z.infer<typeof gameCommandSchema>;

/** Parse the envelope and then the type-specific payload. */
export function parseGameCommand(input: unknown): { command: GameCommand; action: GameAction } {
  const command = gameCommandSchema.parse(input);
  const action = gameActionSchema.parse({ type: command.type, payload: command.payload });
  return { command, action };
}

export const inviteCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(6));

export const createRoomSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(6),
    mode: z.enum(['STANDARD', 'TIMED']),
    turnTimerSeconds: z.union([z.literal(0), z.literal(30), z.literal(45), z.literal(60)]),
  })
  .strict();

export const joinRoomSchema = z.object({ inviteCode: inviteCodeSchema }).strict();
export const roomIdSchema = z.object({ roomId: id }).strict();
export const setReadySchema = z.object({ roomId: id, ready: z.boolean() }).strict();
export const chooseTokenSchema = z.object({ roomId: id, token: z.string().min(1).max(32) }).strict();
export const kickSchema = z.object({ roomId: id, uid: id }).strict();
export const reactionSchema = z
  .object({ roomId: id, gameId: id.nullable(), emoteId: z.string().min(1).max(32), nonce: z.string().min(8).max(64) })
  .strict();
export const friendCodeSchema = z
  .object({ friendCode: z.string().transform((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).pipe(z.string().length(8)) })
  .strict();
export const respondFriendSchema = z.object({ requestId: id, response: z.enum(['ACCEPT', 'REJECT']) }).strict();
export const requestIdSchema = z.object({ requestId: id }).strict();
export const friendUidSchema = z.object({ friendUid: id }).strict();
export const inviteFriendSchema = z.object({ roomId: id, friendUid: id }).strict();
export const archivesPageSchema = z
  .object({ cursor: z.number().int().nullable().default(null), pageSize: z.number().int().min(1).max(50).default(10) })
  .strict();
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} ._-]+$/u),
    allowFriendRequests: z.enum(['everyone', 'friendsOfFriends', 'nobody']),
  })
  .partial()
  .strict();
