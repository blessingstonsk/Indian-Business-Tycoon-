import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

// Runs only against the Firestore emulator:
//   firebase emulators:exec --only firestore "npx vitest run tests/rules"
const host = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!host)('firestore.rules', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [h, port] = host!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-ibt-rules',
      firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: h, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/alice'), { uid: 'alice', friendCode: 'AAAAAAAA' });
      await setDoc(doc(db, 'rooms/r1'), { roomId: 'r1', memberUids: ['alice', 'bob'] });
      await setDoc(doc(db, 'rooms/r1/members/alice'), { uid: 'alice' });
      await setDoc(doc(db, 'rooms/r1/members/bob'), { uid: 'bob' });
      await setDoc(doc(db, 'games/g1'), { roomId: 'r1', version: 1 });
      await setDoc(doc(db, 'games/g1/events/00000001'), { sequence: 1 });
      await setDoc(doc(db, 'games/g1/private/state'), { decks: {} });
      await setDoc(doc(db, 'gameArchives/g0'), { participantUids: ['alice', 'bob'] });
      await setDoc(doc(db, 'commandReceipts/x'), { gameId: 'g1' });
    });
  });

  afterAll(async () => env?.cleanup());

  const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

  it('users read only their own profile and never write it', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice')));
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), { friendCode: 'HACKED00' }));
  });

  it('only members read rooms, games and events', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'rooms/r1')));
    await assertSucceeds(getDoc(doc(as('bob'), 'games/g1')));
    await assertSucceeds(getDoc(doc(as('bob'), 'games/g1/events/00000001')));
    await assertFails(getDoc(doc(as('mallory'), 'rooms/r1')));
    await assertFails(getDoc(doc(as('mallory'), 'games/g1')));
    await assertFails(getDoc(doc(as('mallory'), 'games/g1/events/00000001')));
    await assertFails(getDoc(doc(as(null), 'games/g1')));
  });

  it('clients can never write live game state or read deck order', async () => {
    await assertFails(setDoc(doc(as('alice'), 'games/g1'), { roomId: 'r1', version: 99 }));
    await assertFails(getDoc(doc(as('alice'), 'games/g1/private/state')));
    await assertFails(getDoc(doc(as('alice'), 'commandReceipts/x')));
  });

  it('archives are readable only by participants and never writable', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'gameArchives/g0')));
    await assertFails(getDoc(doc(as('mallory'), 'gameArchives/g0')));
    await assertFails(setDoc(doc(as('alice'), 'gameArchives/g0'), { participantUids: ['alice'] }));
  });
});
