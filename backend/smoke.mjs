// End-to-end API smoke test (no test framework, direct fetch).
// Run: node smoke.mjs
const BASE = process.env.API || 'http://localhost:3000/api';

let pass = 0;
let fail = 0;
const results = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  PASS ${name}`); }
  else { fail++; results.push(`  FAIL ${name} ${extra}`); }
}

async function req(method, path, { token, body, form, headers: extraHeaders } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null;
  const txt = await res.text();
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { status: res.status, data, headers: res.headers };
}

const uniq = Date.now();

async function main() {
  // --- health: superadmin login from seed ---
  const ok2 = (s) => s === 200 || s === 201;
  let r = await req('POST', '/auth/login', { body: { login: 'superadmin', password: 'superadmin123' } });
  ok('superadmin login', ok2(r.status) && r.data?.token && r.data?.user?.role === 'SUPER_ADMIN', JSON.stringify(r.data));
  const saToken = r.data?.token;

  // --- bad login ---
  r = await req('POST', '/auth/login', { body: { login: 'superadmin', password: 'wrongpass' } });
  ok('bad login rejected (401)', r.status === 401, `status=${r.status}`);

  // --- register a teacher ---
  const tLogin = `teach_${uniq}`;
  r = await req('POST', '/auth/register-teacher', {
    body: {
      login: tLogin, password: 'teacher123', confirmPassword: 'teacher123',
      firstName: 'Ali', lastName: 'Valiyev',
      phone: '+998 90 111 22 33', email: `t${uniq}@x.com`,
      centerName: `Markaz ${uniq}`, city: 'Toshkent',
    },
  });
  ok('register teacher', ok2(r.status), `${r.status} ${JSON.stringify(r.data)}`);
  const teacherId = r.data?.user?.id || r.data?.id;

  // --- teacher login ---
  r = await req('POST', '/auth/login', { body: { login: tLogin, password: 'teacher123' } });
  ok('teacher login', ok2(r.status) && r.data?.user?.role === 'TEACHER', JSON.stringify(r.data));
  const tToken = r.data?.token;
  const tId = r.data?.user?.id || teacherId;

  // --- me ---
  r = await req('GET', '/auth/me', { token: tToken });
  ok('teacher /auth/me', r.status === 200 && r.data?.role === 'TEACHER');

  // --- (11) file access cookie is set on /auth/me (HttpOnly; JWT never in URL) ---
  const setCookie = r.headers?.get?.('set-cookie') || '';
  ok(
    'HttpOnly file cookie (et_ftoken) issued',
    /et_ftoken=/.test(setCookie) && /HttpOnly/i.test(setCookie),
    setCookie.slice(0, 160),
  );

  // --- create group ---
  r = await req('POST', '/groups', {
    token: tToken,
    body: { name: `Beginner ${uniq}`, level: 'BEGINNER', lessonDays: [1, 3, 5], lessonTime: '15:00', monthlyPrice: 300000 },
  });
  ok('create group', ok2(r.status) && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
  const groupId = r.data?.id;
  // --- group list ---
  r = await req('GET', '/groups', { token: tToken });
  const groups = r.data?.items || r.data?.data || r.data;
  ok('teacher groups list contains new group', Array.isArray(groups) && groups.some((g) => g.id === groupId), JSON.stringify(r.data).slice(0, 200));

  // --- create student into group ---
  const sLogin = `stud_${uniq}`;
  r = await req('POST', '/students', {
    token: tToken,
    body: {
      login: sLogin, password: 'student123', firstName: 'Vali', lastName: 'Aliyev',
      phone: '+998 90 555 66 77', parentPhone: '+998 90 555 66 88',
      memberships: [{ groupId }],
    },
  });
  ok('create student', (r.status === 201 || r.status === 200) && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
  const studentId = r.data?.id;

  // --- student login ---
  r = await req('POST', '/auth/login', { body: { login: sLogin, password: 'student123' } });
  ok('student login', ok2(r.status) && r.data?.user?.role === 'STUDENT', JSON.stringify(r.data));
  const sToken = r.data?.token;
  const sUserId = r.data?.user?.id;

  // --- student my/groups ---
  r = await req('GET', '/my/groups', { token: sToken });
  const myGroups = Array.isArray(r.data) ? r.data : r.data?.items;
  ok('student GET /my/groups', r.status === 200 && Array.isArray(myGroups) && myGroups.some((g) => g.id === groupId), `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

  // --- permissions: student cannot access teacher groups list ---
  r = await req('GET', '/groups', { token: sToken });
  ok('student blocked from /groups (403)', r.status === 403, `status=${r.status}`);

  // --- attendance create + unique constraint ---
  const date = '2026-10-06';
  r = await req('POST', '/attendance', {
    token: tToken,
    body: { groupId, date, records: [{ studentId, present: true }] },
  });
  ok('attendance save', (r.status === 201 || r.status === 200), `${r.status} ${JSON.stringify(r.data)}`);

  r = await req('GET', `/attendance?groupId=${groupId}&date=${date}`, { token: tToken });
  ok('attendance fetch', r.status === 200 && JSON.stringify(r.data).includes(studentId), `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

  // --- homework create ---
  r = await req('POST', '/homework', {
    token: tToken,
    body: { groupId, title: `HW ${uniq}`, description: 'Do exercises 1-5', dueAt: '2026-10-15T00:00:00.000Z' },
  });
  ok('create homework', (r.status === 201 || r.status === 200) && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
  const hwId = r.data?.id;

  // --- student my/homework sees it ---
  r = await req('GET', '/my/homework', { token: sToken });
  const myHw = r.data?.items || r.data?.data || r.data;
  ok('student sees homework', Array.isArray(myHw) && myHw.some((h) => h.id === hwId), JSON.stringify(r.data).slice(0, 200));

  // --- student submit ---
  r = await req('POST', `/my/homework/${hwId}/submit`, { token: sToken, body: { text: 'Done' } });
  ok('student submits homework', (r.status === 201 || r.status === 200), `${r.status} ${JSON.stringify(r.data)}`);

  // --- teacher review submissions ---
  r = await req('GET', `/submissions/homework/${hwId}`, { token: tToken });
  const subs = r.data?.students || [];
  ok('teacher sees submissions', r.status === 200 && Array.isArray(subs) && subs.length > 0, JSON.stringify(r.data).slice(0, 200));
  const subId = subs.find((s) => s.submission)?.submission?.id;

  if (subId) {
    r = await req('PATCH', `/submissions/${subId}/review`, { token: tToken, body: { result: 'DONE', grade: 4, comment: 'Good' } });
    ok('teacher reviews submission', (r.status === 200 || r.status === 201), `${r.status} ${JSON.stringify(r.data)}`);
  }

  // === Simplified homework: optional deadline, optional attachments ===
  r = await req('POST', '/homework', {
    token: tToken,
    body: { groupId, title: `TextOnly ${uniq}`, description: 'No deadline, no files' },
  });
  ok(
    'create text-only homework (no deadline, no files)',
    (r.status === 201 || r.status === 200) && r.data?.id && r.data?.dueAt === null && Array.isArray(r.data?.attachmentUrls),
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // multiple attachments via multipart
  const fd = new FormData();
  fd.append('groupId', groupId);
  fd.append('title', `WithFiles ${uniq}`);
  fd.append('description', 'Has attachments');
  fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'doc1.pdf');
  fd.append('files', new Blob(['hello world'], { type: 'text/plain' }), 'notes.txt');
  r = await req('POST', '/homework', { token: tToken, form: fd });
  ok(
    'create homework with multiple attachments',
    (r.status === 201 || r.status === 200) && r.data?.attachmentUrls?.length === 2,
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // second student for receive + bulk grading
  r = await req('POST', '/students', {
    token: tToken,
    body: {
      login: `stud2_${uniq}`, password: 'student123', firstName: 'Hasan', lastName: 'Aliyev',
      phone: '+998 90 222 33 44', parentPhone: '+998 90 222 33 55', memberships: [{ groupId }],
    },
  });
  ok('create second student', (r.status === 201 || r.status === 200) && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
  const student2Id = r.data?.id;

  // teacher marks a student's homework as received in class
  r = await req('POST', `/submissions/homework/${hwId}/student/${student2Id}/receive`, { token: tToken });
  ok(
    'teacher marks homework received (in class)',
    (r.status === 201 || r.status === 200) && r.data?.status === 'SUBMITTED',
    `${r.status} ${JSON.stringify(r.data)}`,
  );
  const recId = r.data?.id;

  // quick grading: bulk review multiple submissions at once
  r = await req('PATCH', '/submissions/bulk-review', {
    token: tToken,
    body: { reviews: [ { submissionId: subId, grade: 88, comment: 'Bulk' }, { submissionId: recId, grade: 75 } ] },
  });
  ok('bulk-review saves multiple grades', (r.status === 200 || r.status === 201) && r.data?.updated >= 1, `${r.status} ${JSON.stringify(r.data)}`);

  // simplified grading: grade 0-100, no result needed
  if (subId) {
    r = await req('PATCH', `/submissions/${subId}/review`, { token: tToken, body: { grade: 95, comment: '' } });
    ok('review accepts grade 0-100 without result', (r.status === 200 || r.status === 201) && r.data?.grade === 95, `${r.status} ${JSON.stringify(r.data)}`);
  }

  // --- group statistics ---
  r = await req('GET', `/statistics/group?groupId=${groupId}&date=2026-10-06`, { token: tToken });
  ok('group statistics', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

  // --- mark payment paid ---
  r = await req('POST', '/payments/mark-paid', {
    token: tToken,
    body: { studentId, groupId, amount: 300000, periodYear: 2026, periodMonth: 10 },
  });
  ok('mark payment paid', (r.status === 200 || r.status === 201), `${r.status} ${JSON.stringify(r.data)}`);

  r = await req('GET', '/payments', { token: tToken });
  ok('teacher payments list', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

  // --- student my/payments ---
  r = await req('GET', '/my/payments', { token: sToken });
  ok('student my/payments', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

  // --- chat: direct conversation + message ---
  r = await req('GET', '/chat/conversations', { token: tToken });
  ok('teacher conversations list', r.status === 200, `${r.status}`);
  const convs = r.data?.items || r.data?.data || r.data;
  const groupConv = Array.isArray(convs) && convs.find((c) => c.type === 'GROUP');
  ok('group conversation auto-created', !!groupConv, JSON.stringify(r.data).slice(0, 200));

  if (groupConv) {
    r = await req('POST', `/chat/conversations/${groupConv.id}/messages`, { token: tToken, body: { type: 'TEXT', text: 'Salom hammaga!' } });
    ok('send chat message', (r.status === 201 || r.status === 200), `${r.status} ${JSON.stringify(r.data)}`);
    r = await req('GET', `/chat/conversations/${groupConv.id}/messages`, { token: sToken });
    ok('student reads group messages', r.status === 200, `${r.status}`);
  }

  // --- notifications ---
  r = await req('GET', '/notifications', { token: sToken });
  ok('student notifications list', r.status === 200, `${r.status}`);
  r = await req('GET', '/notifications/unread-count', { token: sToken });
  ok('student unread count', r.status === 200, `${r.status}`);

  // --- settings: preferences + password ---
  r = await req('PATCH', '/users/me/preferences', { token: sToken, body: { language: 'EN', theme: 'DARK' } });
  ok('update preferences', r.status === 200, `${r.status}`);

  // --- admin dashboard ---
  r = await req('GET', '/admin/dashboard', { token: saToken });
  ok('admin dashboard', r.status === 200, `${r.status}`);

  // --- student blocked from admin dashboard ---
  r = await req('GET', '/admin/dashboard', { token: sToken });
  ok('student blocked from admin dashboard (403)', r.status === 403, `status=${r.status}`);

  // --- teacher blocked from admin dashboard ---
  r = await req('GET', '/admin/dashboard', { token: tToken });
  ok('teacher blocked from admin dashboard (403)', r.status === 403, `status=${r.status}`);

  // === Security & correctness regression checks ===

  // --- (1) block works only with a validated boolean (BlockDto / SetStudentBlockedDto) ---
  r = await req('PATCH', `/students/${studentId}/block`, { token: tToken, body: {} });
  ok('block without isBlocked rejected (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await req('PATCH', `/students/${studentId}/block`, { token: tToken, body: { isBlocked: true } });
  ok('student blocked (isBlocked=true)', (r.status === 200 || r.status === 201) && r.data?.isBlocked === true, `${r.status} ${JSON.stringify(r.data)}`);

  r = await req('POST', '/auth/login', { body: { login: sLogin, password: 'student123' } });
  ok('blocked student cannot login (403)', r.status === 403, `status=${r.status}`);

  r = await req('PATCH', `/students/${studentId}/block`, { token: tToken, body: { isBlocked: false } });
  ok('student unblocked', (r.status === 200 || r.status === 201) && r.data?.isBlocked === false, `${r.status}`);

  // --- (2) login reuse rules ---
  const t2Login = `teach2_${uniq}`;
  r = await req('POST', '/auth/register-teacher', {
    body: {
      login: t2Login, password: 'teacher123', confirmPassword: 'teacher123',
      firstName: 'Bek', lastName: 'Karimov', phone: '+998 90 777 88 99',
      email: `t2_${uniq}@x.com`, centerName: `Markaz2 ${uniq}`, city: 'Toshkent',
    },
  });
  const t2Token = r.data?.token;
  r = await req('POST', '/groups', {
    token: t2Token,
    body: { name: `T2 Group ${uniq}`, level: 'BEGINNER', lessonDays: [2, 4], lessonTime: '16:00', monthlyPrice: 250000 },
  });
  const group2Id = r.data?.id;
  r = await req('POST', '/students', {
    token: t2Token,
    body: {
      login: sLogin, password: 'student123', firstName: 'Vali', lastName: 'Aliyev',
      phone: '+998 90 555 66 77', parentPhone: '+998 90 555 66 88',
      memberships: [{ groupId: group2Id }],
    },
  });
  ok('foreign teacher cannot reuse login (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await req('POST', '/groups', {
    token: tToken,
    body: { name: `Own Other ${uniq}`, level: 'BEGINNER', lessonDays: [2, 4], lessonTime: '17:00', monthlyPrice: 200000 },
  });
  const ownGroup2Id = r.data?.id;
  r = await req('POST', '/students', {
    token: tToken,
    body: {
      login: sLogin, password: 'student123', firstName: 'Vali', lastName: 'Aliyev',
      phone: '+998 90 555 66 77', parentPhone: '+998 90 555 66 88',
      memberships: [{ groupId: ownGroup2Id }],
    },
  });
  ok(
    'own teacher can add own student to own group (reused=true)',
    (r.status === 200 || r.status === 201) && r.data?.id === studentId && r.data?.reused === true,
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // --- (4) chat message: empty text and foreign fileUrl are rejected ---
  if (groupConv) {
    r = await req('POST', `/chat/conversations/${groupConv.id}/messages`, { token: tToken, body: { type: 'TEXT', text: '   ' } });
    ok('empty chat message rejected (400)', r.status === 400, `status=${r.status}`);

    r = await req('POST', `/chat/conversations/${groupConv.id}/messages`, { token: tToken, body: { type: 'IMAGE', fileUrl: '/api/files/not-a-real-id' } });
    ok('chat foreign fileUrl rejected (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);
  }

  // --- (4c) material removeImage only removes an image owned by the material ---
  const mfd = new FormData();
  mfd.append('groupId', groupId);
  mfd.append('title', `Mat ${uniq}`);
  mfd.append('type', 'IMAGE');
  mfd.append('files', new Blob(['png-bytes'], { type: 'image/png' }), 'pic.png');
  r = await req('POST', '/materials', { token: tToken, form: mfd });
  const materialId = r.data?.id;
  const materialImage = r.data?.imageUrls?.[0];
  if (materialId && materialImage) {
    r = await req('DELETE', `/materials/${materialId}/images`, { token: tToken, body: { url: '/api/files/foreign.jpg' } });
    ok('removeImage foreign url rejected (404)', r.status === 404, `status=${r.status}`);
    r = await req('DELETE', `/materials/${materialId}/images`, { token: tToken, body: { url: materialImage } });
    ok('removeImage own url removed (200)', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);
  } else {
    ok('material image setup for removeImage test', false, JSON.stringify(r.data));
  }

  // --- materials list tolerates an empty `type` filter (frontend "all" sends type=) ---
  r = await req('GET', '/materials?page=1&pageSize=12&search=&groupId=all&type=', { token: tToken });
  ok('materials list with empty type filter (200)', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);

  // --- (6) trust proxy: per-IP login lockout honours X-Forwarded-For ---
  const rlLogin = `rl_${uniq}`;
  let last;
  for (let i = 0; i < 6; i++) {
    last = await req('POST', '/auth/login', {
      headers: { 'X-Forwarded-For': '9.9.9.9' },
      body: { login: rlLogin, password: 'wrongpass1' },
    });
  }
  ok('login lockout uses X-Forwarded-For (429)', last.status === 429, `status=${last.status} ${JSON.stringify(last.data)}`);
  r = await req('POST', '/auth/login', {
    headers: { 'X-Forwarded-For': '8.8.8.8' },
    body: { login: rlLogin, password: 'wrongpass1' },
  });
  ok('lockout is per-IP (other XFF not locked)', r.status === 401, `status=${r.status}`);

  // --- (7) notification links point to real frontend routes ---
  r = await req('GET', '/notifications', { token: sToken });
  const notifs = r.data?.items || r.data?.data || r.data || [];
  const reviewed = Array.isArray(notifs) ? notifs.find((n) => n.type === 'HOMEWORK_REVIEWED') : null;
  ok('homework-reviewed notification links to /my-homework', !!reviewed && reviewed.link === '/my-homework', JSON.stringify(reviewed));

  // --- (12) payment upsert keeps a single row per student+group+month ---
  r = await req('POST', '/payments/mark-paid', { token: tToken, body: { studentId, groupId, amount: 300000, periodYear: 2026, periodMonth: 11 } });
  const pay1 = r.data;
  r = await req('POST', '/payments/mark-paid', { token: tToken, body: { studentId, groupId, amount: 123000, periodYear: 2026, periodMonth: 11 } });
  const pay2 = r.data;
  ok(
    'payment upsert keeps single row (same id, new amount)',
    !!pay1?.id && pay1.id === pay2?.id && pay2?.amount === 123000,
    `p1=${JSON.stringify(pay1)} p2=${JSON.stringify(pay2)}`,
  );

  // --- (13) student payments always include the current month ---
  r = await req('GET', '/my/payments', { token: sToken });
  const tkNow = new Date(Date.now() + 5 * 60 * 60 * 1000); // Tashkent (UTC+5)
  const cy = tkNow.getUTCFullYear();
  const cm = tkNow.getUTCMonth() + 1;
  const payGroups = Array.isArray(r.data) ? r.data : (r.data?.items || []);
  const hasCurrentMonth = payGroups.some(
    (g) => Array.isArray(g.months) && g.months.some((m) => m.year === cy && m.month === cm),
  );
  ok('student payments include current month', r.status === 200 && hasCurrentMonth, JSON.stringify(r.data).slice(0, 200));

  console.log('\n=== SMOKE RESULTS ===');
  console.log(results.join('\n'));
  console.log(`\nPASS=${pass} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE CRASH', e); process.exit(2); });
