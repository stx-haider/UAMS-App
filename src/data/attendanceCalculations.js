export function normalizeThreshold(value) {
  const threshold = Number(value ?? 75);
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 100 ? threshold : 75;
}

export function calculateAggregateRows(students, records, threshold) {
  const presentByStudent = new Map(students.map((student) => [student.id, 0]));
  for (const record of records) {
    for (const [studentId, status] of Object.entries(record.marks || {})) {
      if (status === 'Present' && presentByStudent.has(studentId)) {
        presentByStudent.set(studentId, presentByStudent.get(studentId) + 1);
      }
    }
  }
  return students.map((student) => {
    const attended = presentByStudent.get(student.id) || 0;
    const percentage = records.length ? Math.round((attended / records.length) * 10000) / 100 : 0;
    return {
      studentId: student.id,
      rollNo: student.rollNo,
      name: student.name,
      attended,
      total: records.length,
      percentage,
      eligible: percentage >= threshold,
    };
  });
}
