import assert from 'node:assert/strict';
import test from 'node:test';

test('spreadsheet package exports and reads a workbook without a network', async () => {
  const loaded = await import('@e965/xlsx');
  const xlsx = loaded.default ?? loaded;
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
    { 'Roll No': '01', 'Student Name': 'Offline Student' },
  ]), 'Students');

  const encoded = xlsx.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const restored = xlsx.read(encoded, { type: 'base64' });
  const rows = xlsx.utils.sheet_to_json(restored.Sheets.Students, { defval: '' });
  assert.deepEqual(rows, [{ 'Roll No': '01', 'Student Name': 'Offline Student' }]);
});