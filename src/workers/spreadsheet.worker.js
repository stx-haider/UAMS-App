import * as XLSX from '@e965/xlsx';

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'export' || type === 'export-subject-report') {
      let rows = payload.rows;
      if (type === 'export-subject-report') {
        rows = payload.records
          .slice()
          .sort((left, right) => `${left.date}-${left.lecture}`.localeCompare(`${right.date}-${right.lecture}`))
          .flatMap((record) => payload.students.map((student) => ({
            Date: record.date,
            Lecture: record.lecture,
            'Roll No': student.rollNo,
            'Student Name': student.name,
            Status: record.marks[student.id] || 'Unmarked',
            'Approval status': record.status,
          })));
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), payload.sheet.slice(0, 31));
      self.postMessage({ id, result: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) });
      return;
    }
    if (type === 'import') {
      const workbook = XLSX.read(payload, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      self.postMessage({ id, result: XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) });
      return;
    }
    throw new Error('Unsupported spreadsheet operation.');
  } catch (error) {
    self.postMessage({ id, error: error.message || 'Could not process this spreadsheet.' });
  }
});
