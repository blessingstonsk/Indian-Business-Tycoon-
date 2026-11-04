import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  archivesPageSchema,
  chooseTokenSchema,
  createRoomSchema,
  friendCodeSchema,
  friendUidSchema,
  inviteFriendSchema,
  joinRoomSchema,
  kickSchema,
  reactionSchema,
  requestIdSchema,
  respondFriendSchema,
  roomIdSchema,
  setReadySchema,
  updateProfileSchema,
} from '../../shared/index';
import { archiveGame } from './archive-service/archive';
import { callable, REGION } from './callable/handler';
import { runCleanup } from './cleanup/cleanup';
import { FirestoreDb } from './db/firestore-db';
import { systemClock } from './db/types';
import * as friends from './friend-service/friends';
import { submitGameAction as submit, sweepTimeouts } from './game-engine/game-service';
import * as rooms from './room-service/rooms';
import type { ServiceContext } from './shared/context';
import { randomCode, randomId, secureRandomInt } from './shared/ids';

initializeApp();

let ctx: ServiceContext | null = null;
const getCtx = (): ServiceContext =>
  (ctx ??= {
    db: new FirestoreDb(getFirestore()),
    clock: systemClock,
    randomInt: secureRandomInt,
    newId: randomId,
    newCode: randomCode,
  });

const empty = z.object({}).strict();
const roomSettings = createRoomSchema.extend({ roomId: z.string().min(1).max(64) });
const inviteIdSchema = z.object({ inviteId: z.string().min(1).max(130) }).strict();

// Profiles & friends
export const bootstrapProfile = callable('bootstrapProfile', empty, getCtx, (c, caller) => friends.bootstrapProfile(c, caller));
export const updateProfile = callable('updateProfile', updateProfileSchema, getCtx, (c, caller, i) => friends.updateProfile(c, caller, i));
export const sendFriendRequest = callable('sendFriendRequest', friendCodeSchema, getCtx, (c, caller, i) => friends.sendFriendRequest(c, caller, i.friendCode));
export const respondFriendRequest = callable('respondFriendRequest', respondFriendSchema, getCtx, (c, caller, i) =>
  friends.respondFriendRequest(c, caller, i.requestId, i.response),
);
export const cancelFriendRequest = callable('cancelFriendRequest', requestIdSchema, getCtx, (c, caller, i) => friends.cancelFriendRequest(c, caller, i.requestId));
export const removeFriend = callable('removeFriend', friendUidSchema, getCtx, (c, caller, i) => friends.removeFriend(c, caller, i.friendUid));
export const getMyArchives = callable('getMyArchives', archivesPageSchema, getCtx, (c, caller, i) => friends.getMyArchives(c, caller, i.cursor, i.pageSize));
export const deleteAccount = callable('deleteAccount', empty, getCtx, async (c, caller) => {
  await friends.deleteAccountData(c, caller);
  await getAuth().deleteUser(caller.uid);
  return { deleted: true };
});

// Rooms
export const createRoom = callable('createRoom', createRoomSchema, getCtx, (c, caller, i) => rooms.createRoom(c, caller, i));
export const joinRoom = callable('joinRoom', joinRoomSchema, getCtx, (c, caller, i) => rooms.joinRoom(c, caller, i.inviteCode));
export const leaveRoom = callable('leaveRoom', roomIdSchema, getCtx, (c, caller, i) => rooms.leaveRoom(c, caller, i.roomId));
export const kickMember = callable('kickMember', kickSchema, getCtx, (c, caller, i) => rooms.kickMember(c, caller, i.roomId, i.uid));
export const setReady = callable('setReady', setReadySchema, getCtx, (c, caller, i) => rooms.setReady(c, caller, i.roomId, i.ready));
export const chooseToken = callable('chooseToken', chooseTokenSchema, getCtx, (c, caller, i) => rooms.chooseToken(c, caller, i.roomId, i.token));
export const updateRoomSettings = callable('updateRoomSettings', roomSettings, getCtx, (c, caller, { roomId, ...s }) =>
  rooms.updateRoomSettings(c, caller, roomId, s),
);
export const startGame = callable('startGame', roomIdSchema, getCtx, (c, caller, i) => rooms.startGame(c, caller, i.roomId));
export const inviteFriend = callable('inviteFriend', inviteFriendSchema, getCtx, (c, caller, i) => rooms.inviteFriend(c, caller, i.roomId, i.friendUid));
export const dismissInvite = callable('dismissInvite', inviteIdSchema, getCtx, (c, caller, i) => rooms.dismissInvite(c, caller, i.inviteId));
export const sendReaction = callable('sendReaction', reactionSchema, getCtx, (c, caller, i) => rooms.sendReaction(c, caller, i));

// Game commands (payload validated inside the service with the shared command schemas)
export const submitGameAction = callable('submitGameAction', z.unknown(), getCtx, (c, caller, i) => submit(c, caller, i));

// Lifecycle
export const onArchiveJobCreated = onDocumentCreated({ region: REGION, document: 'archiveJobs/{gameId}' }, async (event) => {
  const status = await archiveGame(getCtx(), event.params.gameId);
  logger.info('archive_job', { gameId: event.params.gameId, status });
});

export const enforceTurnDeadlines = onSchedule({ region: REGION, schedule: 'every 1 minutes' }, async () => {
  const applied = await sweepTimeouts(getCtx());
  if (applied) logger.info('timeouts_applied', { applied });
});

export const scheduledCleanup = onSchedule({ region: REGION, schedule: 'every 15 minutes' }, async () => {
  const report = await runCleanup(getCtx());
  if (report.errors.length) logger.error('cleanup_errors', { errors: report.errors });
  logger.info('cleanup_report', { ...report, errors: report.errors.length });
});
