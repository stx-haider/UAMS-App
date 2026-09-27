import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAggregateRows, normalizeThreshold } from '../src/data/attendanceCalculations.js';
import { validateAttendanceDateAndLecture } from '../src/data/attendanceValidation.js';

test('zero-percent threshold is preserved and aggregate totals are correct', () => {
  assert.equal(normalizeThreshold(0), 0);
  assert.equal(normalizeThreshold('0'), 0);
  assert.equal(normalizeThreshold(undefined), 75);
  assert.equal(normalizeThreshold(101), 75);

  const students = [
    { id: 'a', rollNo: '01', name: 'Ada' },
    { id: 'b', rollNo: '02', name: 'Bo' },
  ];
  const rows = calculateAggregateRows(students, [
    { marks: { a: 'Present', b: 'Absent' } },
    { marks: { a: 'Absent', b: 'Absent' } },
  ], normalizeThreshold(0));
  assert.deepEqual(rows.map(({ attended, total, percentage, eligible }) => ({ attended, total, percentage, eligible })), [
    { attended: 1, total: 2, percentage: 50, eligible: true },
    { attended: 0, total: 2, percentage: 0, eligible: true },
  ]);
});

test('attendance date and lecture validation reject malformed input', () => {
  assert.equal(validateAttendanceDateAndLecture('2026-09-25', '1'), '');
  assert.match(validateAttendanceDateAndLecture('', '1'), /valid attendance date/);
  assert.match(validateAttendanceDateAndLecture('2026-02-31', '1'), /valid attendance date/);
  assert.match(validateAttendanceDateAndLecture('2026-09-25', '0'), /positive whole number/);
  assert.match(validateAttendanceDateAndLecture('2026-09-25', '1.5'), /positive whole number/);
});