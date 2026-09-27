import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticateAccount,
  exportBackupData,
  getActiveAccountId,
  logoutAccount,
  readState,
  registerAccount,
  restoreBackupForAccount,
  updateState,
} from '../src/data/database.js';

test('local accounts stay isolated and backup restore preserves their records', async () => {
  const first = await registerAccount({ crId: 'CR-001', name: 'First CR', password: 'first-password' });
  assert.equal(first.exists, false);
  assert.equal((await registerAccount({ crId: 'cr-001', password: 'another-password' })).exists, true);

  await authenticateAccount('CR-001', 'first-password');
  await Promise.all([
    updateState((state) => {
      state.students.push({ id: 'student-1', rollNo: '01', name: 'Student One' });
      return state;
    }),
    updateState((state) => {
      state.subjects.push({ id: 'subject-1', name: 'Offline Systems' });
      return state;
    }),
  ]);
  const backup = JSON.stringify(await exportBackupData());

  await registerAccount({ crId: 'CR-002', name: 'Second CR', password: 'second-password' });
  await authenticateAccount('CR-002', 'second-password');
  assert.deepEqual((await readState()).students, []);
  await assert.rejects(authenticateAccount('CR-002', 'wrong-password'), /incorrect/);

  await authenticateAccount('CR-001', 'first-password');
  assert.equal((await readState()).students.length, 1);
  let releaseWrite;
  const pendingWrite = updateState(async (state) => {
    await new Promise((resolve) => { releaseWrite = resolve; });
    state.students.push({ id: 'student-2', rollNo: '02', name: 'Student Two' });
    return state;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const firstAccountId = getActiveAccountId();
  await authenticateAccount('CR-002', 'second-password');
  releaseWrite();
  await pendingWrite;
  assert.deepEqual((await readState()).students, []);
  await authenticateAccount('CR-001', 'first-password');
  assert.equal(getActiveAccountId(), firstAccountId);
  assert.equal((await readState()).students.length, 2);

  await updateState((state) => {
    state.students = [];
    return state;
  });
  await restoreBackupForAccount({ text: async () => backup }, firstAccountId);
  const restored = await readState();
  assert.equal(restored.students[0].rollNo, '01');
  assert.equal(restored.subjects[0].name, 'Offline Systems');

  await authenticateAccount('CR-002', 'second-password');
  await assert.rejects(restoreBackupForAccount({ text: async () => backup }, getActiveAccountId()), /different CR account/);
  await assert.rejects(restoreBackupForAccount({ text: async () => {
    const value = JSON.parse(backup);
    delete value.ownerCrId;
    delete value.settings.crId;
    return JSON.stringify(value);
  } }, getActiveAccountId()), /no CR owner identity/);
  await assert.rejects(restoreBackupForAccount({ text: async () => JSON.stringify({ ...JSON.parse(backup), schema: 99 }) }, getActiveAccountId()), /format is not supported/);
  const invalidRows = JSON.parse(backup);
  invalidRows.students[0].id = undefined;
  await assert.rejects(restoreBackupForAccount({ text: async () => JSON.stringify(invalidRows) }, firstAccountId), /invalid student, subject or attendance/);
  const concurrentAccounts = await Promise.all([
    registerAccount({ crId: 'CR-RACE', name: 'First claim', password: 'first-password' }),
    registerAccount({ crId: 'cr-race', name: 'Second claim', password: 'second-password' }),
  ]);
  assert.equal(concurrentAccounts.filter((result) => !result.exists).length, 1);
  logoutAccount();
});