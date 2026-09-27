export function validateAttendanceDateAndLecture(date, lecture) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return 'Choose a valid attendance date.';
  const [, year, month, day] = match.map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
    return 'Choose a valid attendance date.';
  }
  if (!Number.isInteger(Number(lecture)) || Number(lecture) < 1) {
    return 'Lecture number must be a positive whole number.';
  }
  return '';
}
