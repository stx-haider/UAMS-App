import localforage from 'localforage';

// LocalForage uses IndexedDB in modern browsers and a durable local fallback where needed.
// Data is keyed by account ID so different CR accounts on one device never share records.
const database = localforage.createInstance({ name: 'uams-offline', storeName: 'university_attendance' });
const ACCOUNTS_KEY = 'cr-accounts-v1';
const LEGACY_STATE_KEY = 'application-state-v1';
const listeners = new Set();
const writesByAccount = new Map();
let activeAccountId = null;
let accountsWriteQueue = Promise.resolve();

function withAccountsLock(mutator) {
  const next = accountsWriteQueue.catch(() => {}).then(mutator);
  accountsWriteQueue = next;
  return next;
}

const emptyState = (account = {}) => ({
  students: [], subjects: [], attendance: [],
  aggregates: { midterm: {}, final: {} },
  settings: {
    crName: account.name || '', crId: account.crId || '', department: account.department || '',
    program: account.program || '', semester: account.semester || '', section: account.section || '',
    academicSession: account.academicSession || '', threshold: 75,
  },
  activity: [],
});

const normalizeState = (state, account) => ({
  ...emptyState(account),
  ...state,
  settings: {
    ...emptyState(account).settings,
    ...state?.settings,
    ...accountProfile(account),
    threshold: state?.settings?.threshold ?? 75,
  },
  aggregates: { midterm: {}, final: {}, ...state?.aggregates },
});

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getAccounts() {
  return await database.getItem(ACCOUNTS_KEY) || [];
}

async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Secure local password hashing is unavailable in this browser. Open the app through localhost or its installed desktop/mobile app.');
  }
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function registerAccount(details) {
  const crId = String(details.crId || '').trim();
  if (!crId || !details.password) throw new Error('CR ID and password are required.');
  const salt = createId();
  const account = {
    id: createId(), crId, name: String(details.name || crId).trim(),
    department: String(details.department || '').trim(), program: String(details.program || '').trim(),
    semester: String(details.semester || '').trim(), section: String(details.section || '').trim(),
    academicSession: String(details.academicSession || '').trim(), salt,
    passwordHash: await hashPassword(details.password, salt),
    createdAt: new Date().toISOString(),
  };
  const created = await withAccountsLock(async () => {
    const accounts = await getAccounts();
    if (accounts.some((saved) => saved.crId.toLowerCase() === crId.toLowerCase())) return false;
    accounts.push(account);
    await database.setItem(ACCOUNTS_KEY, accounts);
    return true;
  });
  if (!created) return { exists: true };

  // Migrate legacy single-account data only when its saved identity matches this CR.
  // Never assign unowned shared data to whichever account happens to sign up first.
  const legacy = await database.getItem(LEGACY_STATE_KEY);
  const legacySettings = legacy?.settings || {};
  const legacyIds = [legacySettings.crId, legacySettings.crName]
    .map((value) => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean);
  const accountIds = [account.crId, account.name]
    .map((value) => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean);
  const legacyBelongsToAccount = legacyIds.some((identity) => accountIds.includes(identity));
  const initial = legacy && legacyBelongsToAccount
    ? normalizeState(legacy, account)
    : emptyState(account);
  initial.settings = { ...initial.settings, ...accountProfile(account), crId, threshold: initial.settings.threshold ?? 75 };
  initial.ownerAccountId = account.id;
  await database.setItem(`cr-state:${account.id}`, initial);
  if (legacy && legacyBelongsToAccount) await database.removeItem(LEGACY_STATE_KEY);
  return { exists: false, account: publicAccount(account) };
}

function publicAccount(account) {
  if (!account) return null;
  const safeAccount = { ...account };
  delete safeAccount.passwordHash;
  delete safeAccount.salt;
  return safeAccount;
}

function accountProfile(account) {
  return {
    crName: account.name, crId: account.crId, department: account.department,
    program: account.program, semester: account.semester, section: account.section,
    academicSession: account.academicSession,
  };
}

export async function authenticateAccount(crIdInput, password) {
  const crId = String(crIdInput || '').trim();
  const account = (await getAccounts()).find((item) => item.crId.toLowerCase() === crId.toLowerCase());
  if (!account || (await hashPassword(password, account.salt)) !== account.passwordHash) {
    throw new Error('CR ID or password is incorrect.');
  }
  await activateAccount(account.id);
  return publicAccount(account);
}

export async function activateAccount(accountId) {
  const account = (await getAccounts()).find((item) => item.id === accountId);
  if (!account) throw new Error('CR account not found.');
  activeAccountId = account.id;
  notifyAccountChanged();
  return publicAccount(account);
}

export function logoutAccount() {
  activeAccountId = null;
  notifyAccountChanged();
}

export function getActiveAccountId() {
  return activeAccountId;
}

export async function getActiveAccount(accountId = activeAccountId) {
  if (!accountId) return null;
  return publicAccount((await getAccounts()).find((item) => item.id === accountId));
}

export async function updateActiveAccountName(name, accountId = activeAccountId) {
  if (!accountId) throw new Error('Log in to update the CR profile.');
  const updatedName = String(name || '').trim();
  await updateState((state) => {
    state.settings = { ...state.settings, crName: updatedName };
    return state;
  }, accountId);
  await withAccountsLock(async () => {
    const accounts = await getAccounts();
    const account = accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('CR account no longer exists.');
    account.name = updatedName;
    await database.setItem(ACCOUNTS_KEY, accounts);
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAccountChanged() {
  listeners.forEach((listener) => listener(null));
}

export async function readState(accountId = activeAccountId) {
  if (!accountId) return null;
  const account = (await getAccounts()).find((item) => item.id === accountId);
  if (!account) return null;
  const state = await database.getItem(`cr-state:${accountId}`);
  // The database key and owner marker are both tied to the authenticated account.
  // A mismatched marker is never exposed; start an isolated empty state instead.
  if (state?.ownerAccountId !== account.id) return emptyState(account);
  return { ...normalizeState(state, account), ownerAccountId: account.id };
}

export function updateState(mutator, accountId = activeAccountId) {
  if (!accountId) return Promise.reject(new Error('Log in to access CR data.'));
  const previousWrite = writesByAccount.get(accountId) || Promise.resolve();
  const nextWrite = previousWrite.catch(() => {}).then(async () => {
    const accounts = await getAccounts();
    const account = accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('CR account no longer exists.');
    const stored = await database.getItem(`cr-state:${accountId}`);
    const state = stored && stored.ownerAccountId !== accountId
      ? emptyState(account)
      : { ...normalizeState(stored, account), ownerAccountId: accountId };
    const next = await mutator(state) || state;
    await database.setItem(`cr-state:${accountId}`, next);
    if (activeAccountId === accountId) listeners.forEach((listener) => listener(next));
    return next;
  });
  writesByAccount.set(accountId, nextWrite);
  return nextWrite;
}

export function recordActivity(state, message) {
  state.activity.unshift({ id: createId(), message, at: new Date().toISOString() });
  state.activity = state.activity.slice(0, 30);
}

export async function exportBackupData(accountId = activeAccountId) {
  const state = await readState(accountId);
  if (!state) throw new Error('Log in before exporting a backup.');
  const account = await getActiveAccount(accountId);
  if (!account) throw new Error('CR account no longer exists.');
  return { schema: 1, ownerCrId: account.crId, ...state };
}

export async function restoreBackupForAccount(file, accountId) {
  if (!accountId) throw new Error('Log in before restoring a backup.');
  const parsed = typeof file === 'string' ? JSON.parse(file) : file && typeof file.text === 'function' ? JSON.parse(await file.text()) : file;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Backup file is not valid JSON data.');
  if (parsed.schema !== 1) throw new Error('This backup format is not supported.');
  for (const key of ['students', 'subjects', 'attendance']) {
    if (!Array.isArray(parsed[key])) throw new Error(`Backup has invalid ${key} data.`);
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    throw new Error('Backup has invalid settings data.');
  }
  const account = (await getAccounts()).find((item) => item.id === accountId);
  if (!account) throw new Error('CR account no longer exists.');
  const backupOwner = parsed.ownerCrId || parsed.settings.crId;
  if (typeof backupOwner !== 'string' || !backupOwner.trim()) {
    throw new Error('This backup has no CR owner identity and cannot be safely restored.');
  }
  if (backupOwner.trim().toLowerCase() !== account.crId.toLowerCase()) {
    throw new Error('This backup belongs to a different CR account. Log in to the matching account to restore it.');
  }
  const validStudents = parsed.students.every((student) => student && typeof student.id === 'string' && typeof student.rollNo === 'string' && typeof student.name === 'string');
  const validSubjects = parsed.subjects.every((subject) => subject && typeof subject.id === 'string' && typeof subject.name === 'string');
  const validAttendance = parsed.attendance.every((record) => record && typeof record.id === 'string' && typeof record.subjectId === 'string' && typeof record.date === 'string' && Number.isInteger(record.lecture) && record.lecture > 0 && record.marks && typeof record.marks === 'object' && !Array.isArray(record.marks));
  if (!validStudents || !validSubjects || !validAttendance) {
    throw new Error('This backup contains invalid student, subject or attendance records.');
  }
  if (parsed.aggregates !== undefined && (!parsed.aggregates || typeof parsed.aggregates !== 'object' || Array.isArray(parsed.aggregates))) {
    throw new Error('Backup has invalid aggregate data.');
  }
  const threshold = Number(parsed.settings.threshold ?? 75);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error('Backup has an invalid attendance threshold.');
  const state = { ...normalizeState(parsed, account), ownerAccountId: accountId };
  state.settings = { ...state.settings, ...accountProfile(account) };
  const previousWrite = writesByAccount.get(accountId) || Promise.resolve();
  const nextWrite = previousWrite.catch(() => {}).then(() => database.setItem(`cr-state:${accountId}`, state));
  writesByAccount.set(accountId, nextWrite);
  await nextWrite;
  if (activeAccountId === accountId) listeners.forEach((listener) => listener(state));
  return state;
}
