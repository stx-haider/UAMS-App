import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpFromLine, BookOpen, CalendarCheck, Check, CircleAlert,
  ClipboardCheck, Download, FileSpreadsheet, Plus, Search, ShieldCheck, Trash2, Users,
} from 'lucide-react';
import useDatabase from '../hooks/useDatabase';
import useFeedback from '../hooks/useFeedback';
import { calculateAggregateRows, normalizeThreshold } from '../data/attendanceCalculations';
import { validateAttendanceDateAndLecture } from '../data/attendanceValidation';
import { createId, exportBackupData, getActiveAccountId, recordActivity, restoreBackupForAccount, updateActiveAccountName, updateState } from '../data/database';
import { saveOfflineFile } from '../utils/offlineFiles';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const runSpreadsheetTask = (type, payload, transfer = []) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('../workers/spreadsheet.worker.js', import.meta.url), { type: 'module' });
  const id = createId();
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    worker.terminate();
    if (data.error) reject(new Error(data.error));
    else resolve(data.result);
  };
  worker.onerror = (event) => {
    worker.terminate();
    reject(new Error(event.message || 'Could not process this spreadsheet.'));
  };
  worker.postMessage({ id, type, payload }, transfer);
});
const runJsonTask = (type, payload) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('../workers/json.worker.js', import.meta.url), { type: 'module' });
  const id = createId();
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    worker.terminate();
    if (data.error) reject(new Error(data.error));
    else resolve(data.result);
  };
  worker.onerror = (event) => {
    worker.terminate();
    reject(new Error(event.message || 'Could not process this backup.'));
  };
  worker.postMessage({ id, type, payload });
});
const isWeekendDate = (value) => {
  if (!value) return false;
  const [year, month, day] = value.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
};
function useDeviceDate() {
  const [currentDate, setCurrentDate] = useState(today);
  useEffect(() => {
    const refresh = () => setCurrentDate(today());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return currentDate;
}
function suggestedLecture(state, subjectId, date) {
  if (!state || !subjectId) return 1;
  const subjectRecords = state.attendance.filter((record) => record.subjectId === subjectId && !isWeekendDate(record.date) && Number.isInteger(Number(record.lecture)));
  const onDate = subjectRecords.filter((record) => record.date === date);
  if (onDate.length) return Math.max(...onDate.map((record) => Number(record.lecture)));
  const lastLecture = subjectRecords.length ? Math.max(...subjectRecords.map((record) => Number(record.lecture))) : 0;
  return isWeekendDate(date) ? Math.max(lastLecture, 1) : lastLecture + 1;
}
const prettyDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const subjectName = (state, id) => state.subjects.find((subject) => subject.id === id)?.name || 'Deleted subject';
const TABLE_PAGE_SIZE = 100;
const exportRows = async (rows, sheet, name, notify) => {
  const base64 = await runSpreadsheetTask('export', { rows, sheet });
  await saveOfflineFile({
    name,
    base64,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    onSaved: (fileName) => notify(`${fileName} saved in Downloads.`),
  });
};
const exportAttendance = async (state, record, notify) => {
  const rows = state.students.map((student) => ({
    'Roll No': student.rollNo, 'Student Name': student.name,
    Status: record.marks[student.id] || 'Unmarked',
  }));
  return exportRows(rows, 'Attendance', `${subjectName(state, record.subjectId)}_Lecture_${record.lecture}_${record.date}.xlsx`, notify);
};
const exportSubjectReport = async (state, subjectId, notify) => {
  const records = state.attendance.filter((record) => record.subjectId === subjectId);
  if (!records.length) { notify('There are no attendance records to export for this subject.', 'error'); return; }
  const base64 = await runSpreadsheetTask('export-subject-report', { records, students: state.students, sheet: 'Subject attendance' });
  const name = `${subjectName(state, subjectId).replace(/[^a-z0-9]/gi, '_')}_Attendance_Report.xlsx`;
  await saveOfflineFile({
    name,
    base64,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    onSaved: (fileName) => notify(`${fileName} saved in Downloads.`),
  });
};

function PageTitle({ title, subtitle, action }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function Button({ children, variant = 'primary', ...props }) {
  return <button className={`app-button ${variant}`} {...props}>{children}</button>;
}
function StatCard({ icon: Icon, label, value, tone = 'blue', note }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><div><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</div></article>;
}
function Empty({ children = 'No records yet.' }) { return <div className="empty-state">{children}</div>; }
function TableWrap({ children }) { return <div className="table-card"><div className="table-scroll"><table className="system-table">{children}</table></div></div>; }
function Pagination({ page, pageCount, itemCount, onPageChange }) {
  if (pageCount <= 1) return null;
  return <div className="table-pagination"><span>Showing page {page + 1} of {pageCount} · {itemCount} records</span><div><button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button></div></div>;
}

export function DashboardPage() {
  const state = useDatabase();
  const navigate = useNavigate();
  const currentDate = useDeviceDate();
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const todays = isWeekendDate(currentDate) ? [] : state.attendance.filter((record) => record.date === currentDate);
  const pending = state.attendance.filter((record) => record.status === 'Pending approval' && !isWeekendDate(record.date)).length
    + Object.values(state.aggregates.midterm).filter((item) => item.status !== 'Approved').length
    + Object.values(state.aggregates.final).filter((item) => item.status !== 'Approved').length;
  const present = todays.reduce((sum, record) => sum + Object.values(record.marks).filter((mark) => mark === 'Present').length, 0);
  const marked = todays.reduce((sum, record) => sum + Object.keys(record.marks).length, 0);
  return <>
    <PageTitle title="Dashboard" subtitle="A live summary of this CR account's attendance records." />
    <div className="stat-grid">
      <StatCard icon={Users} label="Total students" value={state.students.length} />
      <StatCard icon={BookOpen} label="Subjects" value={state.subjects.length} tone="mint" />
      <StatCard icon={CalendarCheck} label="Today's attendance" value={todays.length} tone="violet" note={marked ? `${present} present of ${marked} marked` : 'No attendance marked today'} />
      <StatCard icon={ClipboardCheck} label="Pending approvals" value={pending} tone="amber" />
    </div>
    <section className="panel quick-panel"><div className="section-heading"><div><h2>Quick actions</h2><p>Go straight to a common task.</p></div></div><div className="quick-grid">
      <button className="quick-action" onClick={() => navigate('/attendance')}><CalendarCheck /><span><strong>Mark attendance</strong><small>Start a lecture record</small></span></button>
      <button className="quick-action" onClick={() => navigate('/students')}><Users /><span><strong>Manage students</strong><small>Add or import students</small></span></button>
      <button className="quick-action" onClick={() => navigate('/subjects')}><BookOpen /><span><strong>Add a subject</strong><small>Set teacher and course code</small></span></button>
      <button className="quick-action" onClick={() => navigate('/attendance')}><FileSpreadsheet /><span><strong>Export attendance</strong><small>Download subject reports</small></span></button>
    </div></section>
    <section className="panel"><div className="section-heading"><div><h2>Today's attendance</h2><p>{prettyDate(currentDate)}</p></div><Button variant="secondary" onClick={() => navigate('/attendance')}>Open attendance</Button></div>
      {isWeekendDate(currentDate) ? <div className="notice-banner">Weekend holiday — no classes are counted today.</div> : todays.length ? <TableWrap><thead><tr><th>Subject</th><th>Lecture</th><th>Status</th><th>Present</th><th>Absent</th></tr></thead><tbody>{todays.map((record) => <tr key={record.id}><td data-label="Subject">{subjectName(state, record.subjectId)}</td><td data-label="Lecture">{record.lecture}</td><td data-label="Status"><StatusBadge status={record.status} /></td><td data-label="Present">{Object.values(record.marks).filter((x) => x === 'Present').length}</td><td data-label="Absent">{Object.values(record.marks).filter((x) => x === 'Absent').length}</td></tr>)}</tbody></TableWrap> : <Empty>No lecture attendance has been recorded today.</Empty>}
    </section>
  </>;
}

export function StudentsPage() {
  const state = useDatabase();
  const { notify, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(null);
  const fileRef = useRef(null);
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const filtered = state.students.filter((student) => `${student.rollNo} ${student.name}`.toLowerCase().includes(deferredSearch.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleStudents = filtered.slice(currentPage * TABLE_PAGE_SIZE, (currentPage + 1) * TABLE_PAGE_SIZE);
  const saveStudent = async (event) => {
    event.preventDefault();
    const accountId = getActiveAccountId();
    const rollNo = form.rollNo.trim();
    const name = form.name.trim();
    if (!rollNo || !name) return;
    try {
      await updateState((next) => {
        if (next.students.some((student) => student.id !== form.id && student.rollNo.toLowerCase() === rollNo.toLowerCase())) {
          throw new Error('That roll number is already in use.');
        }
        if (form.id) next.students = next.students.map((item) => item.id === form.id ? { ...item, rollNo, name } : item);
        else next.students.push({ id: createId(), rollNo, name, createdAt: new Date().toISOString() });
        recordActivity(next, `${form.id ? 'Updated' : 'Added'} student ${rollNo}`);
        return next;
      }, accountId);
      setForm(null);
    } catch (error) { notify(error.message || 'Could not save this student.', 'error'); }
  };
  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    const accountId = getActiveAccountId();
    event.target.value = '';
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const rows = await runSpreadsheetTask('import', buffer, [buffer]);
      const normalize = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const parsed = rows.map((row) => {
        const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), String(value).trim()]));
        return { rollNo: values.rollno || values.rollnumber || values.studentid || '', name: values.studentname || values.name || '' };
      }).filter((row) => row.rollNo && row.name);
      if (!parsed.length) throw new Error('No valid rows found. Use columns Roll No and Student Name.');
      let added = 0;
      let skipped = 0;
      await updateState((next) => {
        const existing = new Set(next.students.map((student) => student.rollNo.toLowerCase()));
        for (const row of parsed) {
          const key = row.rollNo.toLowerCase();
          if (existing.has(key)) { skipped += 1; continue; }
          existing.add(key);
          next.students.push({ id: createId(), ...row, createdAt: new Date().toISOString() });
          added += 1;
        }
        recordActivity(next, `Imported ${added} students from ${file.name}${skipped ? `; skipped ${skipped} duplicates` : ''}`);
        return next;
      }, accountId);
      notify(`Imported ${added} student${added === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} duplicate roll number(s)` : ''}.`);
    } catch (error) { notify(error.message || 'Could not read this spreadsheet.', 'error'); }
  };
  const deleteStudent = async (student) => {
    const accountId = getActiveAccountId();
    if (state.attendance.some((record) => Object.hasOwn(record.marks, student.id))) { notify('This student has attendance history and cannot be deleted. Edit the student instead to preserve records.', 'error'); return; }
    if (!await confirm(`Delete ${student.name} (${student.rollNo})?`, 'Delete student?')) return;
    try {
      await updateState((next) => {
        if (next.attendance.some((record) => Object.hasOwn(record.marks, student.id))) {
          throw new Error('This student now has attendance history and cannot be deleted.');
        }
        next.students = next.students.filter((item) => item.id !== student.id);
        recordActivity(next, `Deleted student ${student.rollNo}`);
        return next;
      }, accountId);
    } catch (error) { notify(error.message || 'Could not delete this student.', 'error'); }
  };
  return <>
    <PageTitle title="Students" subtitle={`${state.students.length} student${state.students.length === 1 ? '' : 's'} stored locally.`} action={<div className="button-row"><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importExcel} /><Button variant="secondary" onClick={() => exportRows([{ 'Roll No': '', 'Student Name': '' }], 'Students', 'Student_Import_Template.xlsx', notify).catch((error) => notify(error.message || 'Could not create the sample sheet.', 'error'))}><Download size={16} /> Sample sheet</Button><Button variant="secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} /> Import Excel</Button><Button onClick={() => setForm({ rollNo: '', name: '' })}><Plus size={16} /> Add student</Button></div>} />
    <section className="panel"><div className="toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search by roll number or name" /></label><span className="muted-text">Showing {filtered.length} of {state.students.length}</span></div>
      {filtered.length ? <><Pagination page={currentPage} pageCount={pageCount} itemCount={filtered.length} onPageChange={setPage} /><TableWrap><thead><tr><th>Roll No</th><th>Student name</th><th>Added</th><th className="actions-col">Actions</th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.id}><td className="strong-cell" data-label="Roll No">{student.rollNo}</td><td data-label="Student name">{student.name}</td><td data-label="Added">{student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}</td><td className="actions-col" data-label="Actions"><button className="icon-button" aria-label={`Edit ${student.name}`} onClick={() => setForm({ ...student })}>Edit</button><button className="icon-button danger" aria-label={`Delete ${student.name}`} onClick={() => deleteStudent(student)}><Trash2 size={16} /></button></td></tr>)}</tbody></TableWrap><Pagination page={currentPage} pageCount={pageCount} itemCount={filtered.length} onPageChange={setPage} /></> : <Empty>{search ? 'No students match this search.' : 'No students yet. Add a student or import an Excel workbook.'}</Empty>}
    </section>
    {form && <Modal title={form.id ? 'Edit student' : 'Add student'} onClose={() => setForm(null)}><form className="form-stack" onSubmit={saveStudent}><label>Roll number<input required value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} /></label><label>Student name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit">Save student</Button></div></form></Modal>}
  </>;
}

export function SubjectsPage() {
  const state = useDatabase();
  const { notify, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [form, setForm] = useState(null);
  const navigate = useNavigate();
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const save = async (event) => {
    event.preventDefault();
    const accountId = getActiveAccountId();
    const name = form.name.trim();
    if (!name) return;
    try {
      await updateState((next) => {
        if (next.subjects.some((item) => item.id !== form.id && item.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('A subject with this name already exists.');
        }
        const subject = { id: form.id || createId(), name, courseCode: form.courseCode.trim(), teacher: form.teacher.trim() };
        if (form.id) next.subjects = next.subjects.map((item) => item.id === form.id ? subject : item);
        else next.subjects.push(subject);
        recordActivity(next, `${form.id ? 'Updated' : 'Added'} subject ${name}`);
        return next;
      }, accountId);
      setForm(null);
    } catch (error) { notify(error.message || 'Could not save this subject.', 'error'); }
  };
  const remove = async (subject) => {
    const accountId = getActiveAccountId();
    if (state.attendance.some((item) => item.subjectId === subject.id)) { notify('This subject has lecture history. It cannot be deleted without losing linked records.', 'error'); return; }
    if (!await confirm(`Delete ${subject.name}?`, 'Delete subject?')) return;
    try {
      await updateState((next) => {
        if (next.attendance.some((record) => record.subjectId === subject.id)) {
          throw new Error('This subject now has lecture history and cannot be deleted.');
        }
        next.subjects = next.subjects.filter((item) => item.id !== subject.id);
        recordActivity(next, `Deleted subject ${subject.name}`);
        return next;
      }, accountId);
    } catch (error) { notify(error.message || 'Could not delete this subject.', 'error'); }
  };
  const filteredSubjects = state.subjects.filter((subject) => `${subject.name} ${subject.courseCode} ${subject.teacher}`.toLowerCase().includes(deferredSearch.toLowerCase()));
  return <>
    <PageTitle title="Subjects" subtitle="Manage courses and their associated teachers." action={<Button onClick={() => setForm({ name: '', courseCode: '', teacher: '' })}><Plus size={16} /> Add subject</Button>} />
    <section className="panel"><div className="toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subjects, course codes or teachers" /></label><span className="muted-text">Showing {filteredSubjects.length} of {state.subjects.length}</span></div>{filteredSubjects.length ? <TableWrap><thead><tr><th>Subject</th><th>Course code</th><th>Teacher</th><th>Lectures</th><th className="actions-col">Actions</th></tr></thead><tbody>{filteredSubjects.map((subject) => <tr key={subject.id}><td className="strong-cell" data-label="Subject">{subject.name}</td><td data-label="Course code">{subject.courseCode || '—'}</td><td data-label="Teacher">{subject.teacher || '—'}</td><td data-label="Lectures">{state.attendance.filter((record) => record.subjectId === subject.id && !isWeekendDate(record.date)).length}</td><td className="actions-col" data-label="Actions"><button className="icon-button" onClick={() => navigate('/attendance', { state: { subjectId: subject.id } })}>Attendance</button><button className="icon-button" onClick={() => setForm({ ...subject })}>Edit</button><button className="icon-button danger" aria-label={`Delete ${subject.name}`} onClick={() => remove(subject)}><Trash2 size={16} /></button></td></tr>)}</tbody></TableWrap> : <Empty>{search ? 'No subjects match your search.' : 'No subjects have been added. Add a subject to start recording separate attendance.'}</Empty>}</section>
    {form && <Modal title={form.id ? 'Edit subject' : 'Add subject'} onClose={() => setForm(null)}><form className="form-stack" onSubmit={save}><label>Subject name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Course code <span className="muted-text">(optional)</span><input value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} /></label><label>Teacher name <span className="muted-text">(optional)</span><input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></label><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit">Save subject</Button></div></form></Modal>}
  </>;
}

export function AttendancePage() {
  const state = useDatabase();
  const { notify, confirm } = useFeedback();
  const location = useLocation();
  const currentDate = useDeviceDate();
  const [subjectId, setSubjectId] = useState(location.state?.subjectId || '');
  const [date, setDate] = useState(today());
  const [lecture, setLecture] = useState('1');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('All');
  const [historyDate, setHistoryDate] = useState('');
  const [historyStatus, setHistoryStatus] = useState('All');
  const [markDraft, setMarkDraft] = useState(null);
  const previousToday = useRef(currentDate);
  const initialSuggestionApplied = useRef(false);
  const navigate = useNavigate();
  const activeSubjectId = subjectId || state?.subjects[0]?.id || '';
  useEffect(() => {
    if (!state || !activeSubjectId || initialSuggestionApplied.current) return;
    setLecture(String(suggestedLecture(state, activeSubjectId, date)));
    initialSuggestionApplied.current = true;
  }, [state, activeSubjectId, date]);
  useEffect(() => {
    if (currentDate === previousToday.current) return;
    const dateWasToday = date === previousToday.current;
    previousToday.current = currentDate;
    if (dateWasToday) {
      setDate(currentDate);
      setLecture(String(suggestedLecture(state, activeSubjectId, currentDate)));
      setMarkDraft(null);
    }
  }, [currentDate, date, state, activeSubjectId]);
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const chosenId = activeSubjectId;
  const existing = state.attendance.find((item) => item.subjectId === chosenId && item.date === date && item.lecture === Number(lecture));
  const recordKey = existing?.id || `${chosenId}:${date}:${lecture}`;
  const marks = markDraft?.key === recordKey ? markDraft.value : existing?.marks || {};
  const filtered = state.students.filter((student) => {
    const matchesSearch = `${student.rollNo} ${student.name}`.toLowerCase().includes(deferredSearch.toLowerCase());
    const status = marks[student.id];
    return matchesSearch && (filter === 'All' || status === filter);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleStudents = filtered.slice(currentPage * TABLE_PAGE_SIZE, (currentPage + 1) * TABLE_PAGE_SIZE);
  const counts = Object.values(marks).reduce((acc, status) => { if (status === 'Present') acc.present += 1; if (status === 'Absent') acc.absent += 1; return acc; }, { present: 0, absent: 0 });
  const locked = existing?.status === 'Approved';
  const holiday = isWeekendDate(date);
  const selectSubject = (value) => { setSubjectId(value); setLecture(String(suggestedLecture(state, value, date))); setMarkDraft(null); };
  const selectDate = (value) => { setDate(value); setLecture(String(suggestedLecture(state, chosenId, value))); setMarkDraft(null); };
  const setStudentMark = (studentId, status) => setMarkDraft({ key: recordKey, value: { ...marks, [studentId]: status } });
  const save = async (status) => {
    if (!chosenId) { notify('Add a subject before creating attendance.', 'error'); return; }
    const inputError = validateAttendanceDateAndLecture(date, lecture);
    if (inputError) { notify(inputError, 'error'); return; }
    if (isWeekendDate(date)) { notify('Saturday and Sunday are university holidays. Attendance cannot be saved on weekends.', 'error'); return; }
    if (!state.students.length) { notify('Add students before creating attendance.', 'error'); return; }
    if (status !== 'Draft' && state.students.some((student) => !marks[student.id])) { notify('Mark every student Present or Absent before submitting.', 'error'); return; }
    if (existing?.status === 'Approved') { notify('Approved attendance is locked.', 'error'); return; }
    await updateState((next) => {
      const index = next.attendance.findIndex((item) => item.subjectId === chosenId && item.date === date && item.lecture === Number(lecture));
      const record = { id: index >= 0 ? next.attendance[index].id : createId(), subjectId: chosenId, date, lecture: Number(lecture), marks: { ...marks }, status, updatedAt: new Date().toISOString(), approvedAt: index >= 0 ? next.attendance[index].approvedAt : null };
      if (index >= 0) next.attendance[index] = record; else next.attendance.push(record);
      recordActivity(next, `${status === 'Draft' ? 'Saved draft' : 'Submitted'} ${subjectName(next, chosenId)} lecture ${lecture} for ${prettyDate(date)}`);
      return next;
    });
  };
  const approve = async () => {
    const accountId = getActiveAccountId();
    if (isWeekendDate(date)) { notify('Weekend attendance cannot be approved or counted as a class.', 'error'); return; }
    if (!existing || existing.status !== 'Pending approval') return;
    if (!await confirm('Confirm that the teacher has checked this attendance and lock this record?', 'Approve and lock attendance?')) return;
    await updateState((next) => { const record = next.attendance.find((item) => item.id === existing.id); record.status = 'Approved'; record.approvedAt = new Date().toISOString(); recordActivity(next, `Approved and locked ${subjectName(next, chosenId)} lecture ${lecture}`); return next; }, accountId);
  };
  const history = [...state.attendance].filter((item) => item.subjectId === chosenId).sort((a, b) => `${b.date}-${b.lecture}`.localeCompare(`${a.date}-${a.lecture}`));
  const filteredHistory = history.filter((item) => (!historyDate || item.date === historyDate) && (historyStatus === 'All' || item.status === historyStatus));
  return <>
    <PageTitle title="Attendance" subtitle="Create a fresh record for each subject, lecture and date." action={state.subjects.length > 0 && <Button variant="secondary" onClick={() => exportSubjectReport(state, chosenId, notify).catch((error) => notify(error.message || 'Could not export attendance.', 'error'))}><FileSpreadsheet size={16} /> Export subject report</Button>} />
    {!state.subjects.length ? <section className="panel"><Empty>No subjects yet. <button className="text-action" onClick={() => navigate('/subjects')}>Add a subject</button> before marking attendance.</Empty></section> : <>
      <section className="panel attendance-panel"><div className="attendance-controls"><label>Subject<select value={chosenId} onChange={(e) => selectSubject(e.target.value)}>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Lecture<input type="number" min="1" value={lecture} onChange={(e) => setLecture(e.target.value)} /></label><label>Date<input type="date" value={date} onChange={(e) => selectDate(e.target.value)} /></label><Button variant="secondary" onClick={() => selectDate(currentDate)}>Today</Button></div>
        <div className="attendance-summary"><div><span className="eyebrow">SELECTED LECTURE</span><h2>{subjectName(state, chosenId)} <span>· Lecture {lecture}</span></h2><p>{prettyDate(date)}{date === currentDate ? ' · Today' : ''}</p></div><div className="summary-counts"><span>Total <b>{state.students.length}</b></span><span className="present-text">Present <b>{counts.present}</b></span><span className="absent-text">Absent <b>{counts.absent}</b></span></div></div>
        {holiday && <div className="notice-banner">Saturday/Sunday holiday — no attendance can be recorded and this date is excluded from classes held.</div>}
        {existing && <div className="record-banner"><StatusBadge status={existing.status} />{existing.status === 'Pending approval' && !holiday ? <Button onClick={approve}><ShieldCheck size={15} /> Approve & lock</Button> : existing.status === 'Approved' ? <span>Approved {existing.approvedAt ? new Date(existing.approvedAt).toLocaleString() : ''}; editing is disabled.</span> : <span>This saved record can still be edited.</span>}</div>}
        <div className="toolbar attendance-toolbar"><div className="filter-tabs" role="group" aria-label="Filter students by attendance status">{['All', 'Present', 'Absent'].map((value) => <button key={value} type="button" aria-pressed={filter === value} className={`${filter === value ? 'selected' : ''} filter-${value.toLowerCase()}`} onClick={() => { setFilter(value); setPage(0); }}>{value}</button>)}</div><label className="search-field"><Search size={16} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Find a student" /></label></div>
        {filtered.length ? <><Pagination page={currentPage} pageCount={pageCount} itemCount={filtered.length} onPageChange={setPage} /><div className="table-card attendance-marking-card"><div className="table-scroll"><table className="system-table attendance-marking-table"><thead><tr><th>Roll No</th><th>Student name</th><th className="attendance-status-heading">Attendance status</th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.id}><td className="strong-cell" data-label="Roll No">{student.rollNo}</td><td data-label="Student name">{student.name}</td><td className="attendance-status-cell" data-label="Mark attendance"><div className="mark-buttons"><button type="button" disabled={locked || holiday} aria-pressed={marks[student.id] === 'Present'} className={marks[student.id] === 'Present' ? 'mark-present chosen' : 'mark-present'} onClick={() => setStudentMark(student.id, 'Present')}>Present</button><button type="button" disabled={locked || holiday} aria-pressed={marks[student.id] === 'Absent'} className={marks[student.id] === 'Absent' ? 'mark-absent chosen' : 'mark-absent'} onClick={() => setStudentMark(student.id, 'Absent')}>Absent</button></div></td></tr>)}</tbody></table></div></div><Pagination page={currentPage} pageCount={pageCount} itemCount={filtered.length} onPageChange={setPage} /></> : <Empty>{search ? 'No students match this search.' : 'No students to mark. Add students first.'}</Empty>}
        <div className="attendance-footer">{existing && <Button variant="secondary" onClick={() => exportAttendance(state, existing, notify).catch((error) => notify(error.message || 'Could not export attendance.', 'error'))}><FileSpreadsheet size={16} /> Export Excel</Button>}<span className="muted-text">{Object.keys(marks).length} of {state.students.length} marked</span><Button variant="secondary" disabled={locked || holiday} onClick={() => save('Draft')}>Save draft</Button><Button disabled={locked || holiday} onClick={() => save('Pending approval')}>{existing?.status === 'Pending approval' ? 'Update submission' : 'Submit for approval'}</Button></div>
      </section>
      <section className="panel"><div className="section-heading"><div><h2>Lecture history</h2><p>Filter previous dates and statuses for {subjectName(state, chosenId)}.</p></div></div><div className="history-filters"><label>Date<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label><label>Status<select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option>All</option><option>Draft</option><option>Pending approval</option><option>Approved</option></select></label>{(historyDate || historyStatus !== 'All') && <Button variant="secondary" onClick={() => { setHistoryDate(''); setHistoryStatus('All'); }}>Clear filters</Button>}</div>{filteredHistory.length ? <TableWrap><thead><tr><th>Date</th><th>Lecture</th><th>Total marked</th><th>Present</th><th>Absent</th><th>Status</th><th /></tr></thead><tbody>{filteredHistory.map((item) => <tr key={item.id}><td data-label="Date">{prettyDate(item.date)}</td><td data-label="Lecture">{item.lecture}</td><td data-label="Total marked">{Object.keys(item.marks).length}</td><td data-label="Present">{Object.values(item.marks).filter((x) => x === 'Present').length}</td><td data-label="Absent">{Object.values(item.marks).filter((x) => x === 'Absent').length}</td><td data-label="Status"><StatusBadge status={item.status} /></td><td data-label="Actions"><button className="icon-button" onClick={() => { setDate(item.date); setLecture(String(item.lecture)); setMarkDraft(null); }}>Open</button><button className="icon-button" onClick={() => exportAttendance(state, item, notify).catch((error) => notify(error.message || 'Could not export attendance.', 'error'))}>Export</button></td></tr>)}</tbody></TableWrap> : <Empty>{history.length ? 'No lecture records match these filters.' : 'No previous lectures for this subject.'}</Empty>}</section>
    </>}
  </>;
}

export function AggregatePage({ kind }) {
  const state = useDatabase();
  const { notify, confirm } = useFeedback();
  const [subjectId, setSubjectId] = useState('');
  const [tablePage, setTablePage] = useState(0);
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const chosenId = subjectId || state.subjects[0]?.id || '';
  const saved = state.aggregates[kind][chosenId];
  const title = kind === 'midterm' ? 'Mid-Term Aggregate' : 'Final Aggregate';
  const locked = saved?.status === 'Approved';
  const resultPageCount = Math.max(1, Math.ceil((saved?.rows.length || 0) / TABLE_PAGE_SIZE));
  const currentResultPage = Math.min(tablePage, resultPageCount - 1);
  const visibleResultRows = saved?.rows.slice(currentResultPage * TABLE_PAGE_SIZE, (currentResultPage + 1) * TABLE_PAGE_SIZE) || [];
  const generate = async () => {
    const records = state.attendance.filter((record) => record.subjectId === chosenId && record.status === 'Approved' && !isWeekendDate(record.date));
    if (!chosenId) { notify('Add a subject before generating an aggregate.', 'error'); return; }
    if (!records.length) { notify('There are no approved attendance lectures for this subject yet.', 'error'); return; }
    if (locked) { notify('This aggregate is approved and locked.', 'error'); return; }
    const threshold = normalizeThreshold(state.settings.threshold);
    const rows = calculateAggregateRows(state.students, records, threshold);
    await updateState((next) => {
      next.aggregates[kind][chosenId] = { subjectId: chosenId, rows, totalLectures: records.length, threshold, status: 'Pending approval', generatedAt: new Date().toISOString(), approvedAt: null };
      recordActivity(next, `Generated ${kind === 'midterm' ? 'Mid-Term' : 'Final'} aggregate for ${subjectName(next, chosenId)}`);
      return next;
    });
  };
  const approve = async () => {
    const accountId = getActiveAccountId();
    if (!saved || saved.status === 'Approved') return;
    if (!await confirm('Confirm teacher review and lock this subject aggregate?', 'Approve and lock aggregate?')) return;
    await updateState((next) => { next.aggregates[kind][chosenId].status = 'Approved'; next.aggregates[kind][chosenId].approvedAt = new Date().toISOString(); recordActivity(next, `Approved and locked ${kind === 'midterm' ? 'Mid-Term' : 'Final'} aggregate for ${subjectName(next, chosenId)}`); return next; }, accountId);
  };
  const eligible = saved?.rows.filter((row) => row.eligible).length || 0;
  return <>
    <PageTitle title={title} subtitle="Results are calculated for one subject using its approved lectures only." />
    {!state.subjects.length ? <section className="panel"><Empty>Add a subject before generating an aggregate.</Empty></section> : <>
      <section className="panel aggregate-controls"><label>Subject<select value={chosenId} onChange={(e) => { setSubjectId(e.target.value); setTablePage(0); }}>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><div className="aggregate-meta"><span>Eligibility threshold <b>{state.settings.threshold}%</b></span><span>Approved weekday lectures <b>{state.attendance.filter((item) => item.subjectId === chosenId && item.status === 'Approved' && !isWeekendDate(item.date)).length}</b></span></div><Button disabled={locked} onClick={generate}><ClipboardCheck size={16} /> Generate {kind === 'midterm' ? 'Mid-Term' : 'Final'} aggregate</Button></section>
      {saved && <><div className="stat-grid aggregate-stats"><StatCard icon={Users} label="Total students" value={saved.rows.length} /><StatCard icon={Check} label="Eligible" value={eligible} tone="mint" /><StatCard icon={CircleAlert} label="Non-eligible" value={saved.rows.length - eligible} tone="rose" /><StatCard icon={CalendarCheck} label="Approved lectures" value={saved.totalLectures} tone="violet" /></div>
        <section className="panel"><div className="section-heading"><div><h2>{subjectName(state, chosenId)}</h2><p>Generated {new Date(saved.generatedAt).toLocaleString()} · Threshold {saved.threshold}%</p></div><div className="button-row"><Button variant="secondary" onClick={() => exportRows(saved.rows.map((row) => ({ 'Roll No': row.rollNo, 'Student Name': row.name, 'Classes Attended': row.attended, 'Approved Classes': row.total, 'Attendance %': `${row.percentage}%`, Status: row.eligible ? 'Eligible' : 'Non-Eligible' })), 'Aggregate', `${kind}_${subjectName(state, chosenId).replace(/[^a-z0-9]/gi, '_')}.xlsx`, notify).catch((error) => notify(error.message || 'Could not export aggregate.', 'error'))}><FileSpreadsheet size={16} /> Export Excel</Button>{!locked && <Button onClick={approve}><ShieldCheck size={16} /> Approve & lock</Button>}</div></div>
          {saved.status === 'Approved' && <div className="success-banner"><ShieldCheck size={17} /> Approved and locked {saved.approvedAt ? `on ${new Date(saved.approvedAt).toLocaleString()}` : ''}.</div>}{saved.status !== 'Approved' && <div className="notice-banner">Teacher should review this subject result externally before you approve and lock it.</div>}
          <Pagination page={currentResultPage} pageCount={resultPageCount} itemCount={saved.rows.length} onPageChange={setTablePage} /><TableWrap><thead><tr><th>Roll No</th><th>Student name</th><th>Attendance</th><th>Percentage</th><th>Status</th></tr></thead><tbody>{visibleResultRows.map((row) => <tr key={row.studentId}><td data-label="Roll No">{row.rollNo}</td><td data-label="Student name">{row.name}</td><td data-label="Attendance">{row.attended} / {row.total}</td><td className="strong-cell" data-label="Percentage">{row.percentage}%</td><td data-label="Status"><StatusBadge status={row.eligible ? 'Eligible' : 'Non-Eligible'} /></td></tr>)}</tbody></TableWrap><Pagination page={currentResultPage} pageCount={resultPageCount} itemCount={saved.rows.length} onPageChange={setTablePage} />
        </section></>}
    </>}
  </>;
}

export function SettingsPage() {
  const state = useDatabase();
  const { notify, confirm } = useFeedback();
  const backupRef = useRef(null);
  const [savedMessage, setSavedMessage] = useState('');
  if (!state) return <div className="loading-state">Loading local records…</div>;
  const save = async (event) => {
    event.preventDefault();
    const accountId = getActiveAccountId();
    const data = new FormData(event.currentTarget);
    const threshold = Number(data.get('threshold'));
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) { notify('Threshold must be between 0 and 100.', 'error'); return; }
    await updateActiveAccountName(data.get('crName'), accountId);
    await updateState((next) => { next.settings.threshold = threshold; recordActivity(next, 'Updated CR profile and local settings'); return next; }, accountId);
    setSavedMessage('Settings saved on this device.');
    notify('Settings saved on this device.');
    setTimeout(() => setSavedMessage(''), 3000);
  };
  const backup = async () => saveOfflineFile({
    name: `UAMS_Backup_${today()}.json`,
    text: await runJsonTask('stringify', await exportBackupData()),
    mimeType: 'application/json',
    onSaved: (fileName) => notify(`${fileName} saved in Downloads.`),
  }).catch((error) => notify(error.message || 'Could not create the backup.', 'error'));
  const restore = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    const accountId = getActiveAccountId();
    if (!file || !await confirm('Restore this backup? Current local data will be replaced.', 'Replace local data?')) return;
    try {
      const text = await file.text();
      const parsed = await runJsonTask('parse', text);
      await restoreBackupForAccount(parsed, accountId);
      notify('Backup restored successfully.');
    }
    catch (error) { notify(error.message || 'Could not restore this backup.', 'error'); }
  };
  const fields = [['crName', 'CR name'], ['crId', 'CR ID'], ['department', 'Department'], ['program', 'Program'], ['semester', 'Semester'], ['section', 'Section'], ['academicSession', 'Academic session']];
  return <>
    <PageTitle title="Settings" subtitle="Manage your local profile, eligibility rule and data safety." />
    <section className="panel"><div className="section-heading"><div><h2>CR profile</h2><p>Account identity and assigned section are fixed for data separation.</p></div></div><form key={`${state.ownerAccountId}:${state.settings.crName}:${state.settings.threshold}`} className="settings-form" onSubmit={save}><div className="settings-grid">{fields.map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={state.settings[name]} readOnly={name !== 'crName'} /></label>)}<label>Attendance threshold (%)<input type="number" name="threshold" min="0" max="100" step="1" defaultValue={state.settings.threshold} required /></label></div><div className="settings-footer">{savedMessage && <span className="success-text">{savedMessage}</span>}<Button type="submit">Save settings</Button></div></form></section>
    <section className="panel"><div className="section-heading"><div><h2>Local backup & restore</h2><p>Download a backup file or restore one without an internet connection.</p></div></div><div className="backup-actions"><Button variant="secondary" onClick={backup}><Download size={16} /> Backup data</Button><input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={restore} /><Button variant="secondary" onClick={() => backupRef.current?.click()}><ArrowUpFromLine size={16} /> Restore backup</Button></div><p className="muted-text backup-note">Restoring replaces all records currently stored in this browser profile.</p></section>
    <section className="panel app-info"><h2>Application information</h2><p>University Attendance System · Offline local data storage</p><p>Records stay in this browser's local database. Export backups regularly to protect against device or browser data loss.</p></section>
  </>;
}

function StatusBadge({ status }) {
  const style = status === 'Approved' || status === 'Eligible' ? 'green' : status === 'Non-Eligible' ? 'red' : status === 'Pending approval' ? 'amber' : 'gray';
  return <span className={`status-badge ${style}`}>{status}</span>;
}
function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>;
}
