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

  // --- attendance: "kelmadi" (present=false) — saqlash buzilmaydi ---
  r = await req('POST', '/attendance', {
    token: tToken,
    body: { groupId, date, records: [{ studentId, present: false }] },
  });
  ok('attendance mark absent (kelmadi)', (r.status === 201 || r.status === 200), `${r.status} ${JSON.stringify(r.data)}`);

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

  // --- chunked upload (Vercel 4.5MB limitini chetlab o'tuvchi yo'l) ---
  const chunkFd = new FormData();
  chunkFd.append('uploadId', `upload_${uniq}`);
  chunkFd.append('chunkIndex', '0');
  chunkFd.append('totalChunks', '1');
  chunkFd.append('filename', 'chunk-notes.txt');
  chunkFd.append('mimeType', 'text/plain');
  chunkFd.append('size', String(new Blob(['chunked content here']).size));
  chunkFd.append('kind', 'attachment');
  chunkFd.append('scope', 'GROUP');
  chunkFd.append('scopeId', groupId);
  chunkFd.append('file', new Blob(['chunked content here'], { type: 'text/plain' }), 'chunk.bin');
  r = await req('POST', '/files/upload', { token: tToken, form: chunkFd });
  ok(
    'chunked file upload (single chunk) returns file',
    (r.status === 201 || r.status === 200) && !!r.data?.file?.url,
    `${r.status} ${JSON.stringify(r.data)}`,
  );
  const chunkUrl = r.data?.file?.url;

  // --- MULTI-chunk upload: bo'laklar umumiy saqlashda (disk/Blob) yig'ilishi
  //     kerak. Vercel'da har bir so'rov boshqa nusxaga tushishi mumkin, shuning
  //     uchun bo'laklarni jarayon xotirasida saqlab bo'lmaydi. ---
  {
    const SIZE = 8 * 1024 * 1024;
    const CH = 3.5 * 1024 * 1024;
    const total = Math.ceil(SIZE / CH);
    const uploadId = `multi${uniq}`;
    const full = Buffer.alloc(SIZE, 0x41);
    full.write('BEGIN', 0);
    full.write('__FIN', SIZE - 5);
    let fileRec = null;
    let midReturnedFile = false;
    for (let i = 0; i < total; i++) {
      const part = full.subarray(i * CH, Math.min(SIZE, (i + 1) * CH));
      const fd = new FormData();
      fd.append('uploadId', uploadId);
      fd.append('chunkIndex', String(i));
      fd.append('totalChunks', String(total));
      fd.append('filename', 'multi.pdf');
      fd.append('mimeType', 'application/pdf');
      fd.append('size', String(SIZE));
      fd.append('kind', 'attachment');
      fd.append('scope', 'GROUP');
      fd.append('scopeId', groupId);
      fd.append('file', new Blob([part], { type: 'application/pdf' }), `c${i}.part`);
      r = await req('POST', '/files/upload', { token: tToken, form: fd });
      if (i < total - 1 && r.data?.file) midReturnedFile = true;
      if (r.data?.file) fileRec = r.data.file;
    }
    ok('multi-chunk: intermediate chunks do not finish upload', !midReturnedFile, `total=${total}`);
    ok(
      'multi-chunk upload assembles full file',
      !!fileRec?.url && fileRec.size === SIZE,
      `${JSON.stringify(fileRec)}`,
    );
    if (fileRec?.url) {
      const origin = BASE.replace(/\/api$/, '');
      const dl = await fetch(origin + fileRec.url, {
        headers: { Authorization: `Bearer ${tToken}` },
      });
      const buf = Buffer.from(await dl.arrayBuffer());
      ok(
        'multi-chunk assembled content intact',
        dl.status === 200 &&
          buf.length === SIZE &&
          buf.subarray(0, 5).toString() === 'BEGIN' &&
          buf.subarray(SIZE - 5).toString() === '__FIN',
        `status=${dl.status} len=${buf.length}`,
      );
    }
  }

  // homework create with pre-uploaded attachmentUrls (JSON text field)
  const hfd = new FormData();
  hfd.append('groupId', groupId);
  hfd.append('title', `ChunkedHW ${uniq}`);
  hfd.append('attachmentUrls', JSON.stringify([chunkUrl]));
  r = await req('POST', '/homework', { token: tToken, form: hfd });
  ok(
    'homework create via attachmentUrls',
    (r.status === 201 || r.status === 200) &&
      Array.isArray(r.data?.attachmentUrls) &&
      r.data?.attachmentUrls?.includes(chunkUrl),
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // foreign/unowned attachmentUrl must be rejected
  const ffd = new FormData();
  ffd.append('groupId', groupId);
  ffd.append('title', `ForeignHW ${uniq}`);
  ffd.append('attachmentUrls', JSON.stringify(['/api/files/not-a-real-id']));
  r = await req('POST', '/homework', { token: tToken, form: ffd });
  ok('homework foreign attachmentUrl rejected (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

  // student cannot upload to a teacher's group (scope=GROUP requires teacher)
  const badChunk = new FormData();
  badChunk.append('uploadId', `bad_${uniq}`);
  badChunk.append('chunkIndex', '0');
  badChunk.append('totalChunks', '1');
  badChunk.append('filename', 'x.txt');
  badChunk.append('mimeType', 'text/plain');
  badChunk.append('size', String(new Blob(['x']).size));
  badChunk.append('kind', 'attachment');
  badChunk.append('scope', 'GROUP');
  badChunk.append('scopeId', groupId);
  badChunk.append('file', new Blob(['x']), 'x.bin');
  r = await req('POST', '/files/upload', { token: sToken, form: badChunk });
  ok('student cannot upload teacher group file (403)', r.status === 403, `status=${r.status} ${JSON.stringify(r.data)}`);

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

  // login as second student (for submission fileUrl test)
  r = await req('POST', '/auth/login', { body: { login: `stud2_${uniq}`, password: 'student123' } });
  ok('second student login', ok2(r.status) && !!r.data?.token, `${r.status}`);
  const s2Token = r.data?.token;

  // teacher marks a student's homework as received in class
  r = await req('POST', `/submissions/homework/${hwId}/student/${student2Id}/receive`, { token: tToken });
  ok(
    'teacher marks homework received (in class)',
    (r.status === 201 || r.status === 200) && r.data?.status === 'SUBMITTED',
    `${r.status} ${JSON.stringify(r.data)}`,
  );
  const recId = r.data?.id;

  // student submits a file via chunked upload (scope=SUBMISSION) then fileUrl
  const subFd = new FormData();
  subFd.append('uploadId', `sub_${uniq}`);
  subFd.append('chunkIndex', '0');
  subFd.append('totalChunks', '1');
  subFd.append('filename', 'answer.txt');
  subFd.append('mimeType', 'text/plain');
  subFd.append('size', String(new Blob(['my answer']).size));
  subFd.append('kind', 'file');
  subFd.append('scope', 'SUBMISSION');
  subFd.append('scopeId', groupId);
  subFd.append('file', new Blob(['my answer'], { type: 'text/plain' }), 'answer.bin');
  r = await req('POST', '/files/upload', { token: s2Token, form: subFd });
  const subAnswerUrl = r.data?.file?.url;
  ok('student chunk upload for submission (200)', (r.status === 200 || r.status === 201) && !!subAnswerUrl, `${r.status} ${JSON.stringify(r.data)}`);
  r = await req('POST', `/my/homework/${hwId}/submit`, { token: s2Token, body: { text: 'Updated answer', fileUrl: subAnswerUrl } });
  ok(
    'student submits homework with fileUrl',
    (r.status === 201 || r.status === 200) && r.data?.fileUrl === subAnswerUrl,
    `${r.status} ${JSON.stringify(r.data)}`,
  );

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

  // --- payment deadline (har oy uchun qo'lda tanlanadi) ---
  r = await req('PUT', '/payments/deadline', {
    token: tToken,
    body: { periodYear: 2026, periodMonth: 10, dueDate: '2026-10-20' },
  });
  ok('set payment deadline', r.status === 200 && !!r.data?.dueDate, `${r.status} ${JSON.stringify(r.data)}`);

  r = await req('GET', '/payments/deadline?year=2026&month=10', { token: tToken });
  ok('get payment deadline', r.status === 200 && String(r.data?.dueDate).slice(0, 10) === '2026-10-20', `${r.status} ${JSON.stringify(r.data)}`);

  r = await req('GET', '/payments?year=2026&month=10', { token: tToken });
  ok('payments list includes deadline', r.status === 200 && String(r.data?.deadline).slice(0, 10) === '2026-10-20', `${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);

  // --- ota-ona Telegram ulash tokeni ---
  r = await req('POST', `/students/${sUserId}/telegram-link`, { token: tToken });
  ok(
    'student telegram link generated',
    (r.status === 200 || r.status === 201) && !!r.data?.token && /^https:\/\/t\.me\//.test(r.data?.url || ''),
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  r = await req('POST', `/students/${sUserId}/telegram-unlink`, { token: tToken });
  ok('student telegram unlink', (r.status === 200 || r.status === 201) && r.data?.linked === false, `${r.status} ${JSON.stringify(r.data)}`);

  // --- Telegram webhook buyruqlari (routing; xabar yuborish bot tokeniga bog'liq) ---
  const tgSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  for (const cmd of ['/homework', '/grade', '/help']) {
    r = await req('POST', '/telegram/webhook', {
      body: { message: { chat: { id: 990001 }, text: cmd } },
      headers: tgSecret ? { 'x-telegram-bot-api-secret-token': tgSecret } : {},
    });
    ok(`telegram webhook ${cmd} ok`, (r.status === 200 || r.status === 201) && r.data?.ok === true, `${r.status} ${JSON.stringify(r.data)}`);
  }

  // --- (yangi) Telegram self-link: o'qituvchi va o'quvchi o'z holatini ko'radi ---
  r = await req('GET', '/users/me/telegram', { token: tToken });
  ok(
    'teacher telegram status returns link',
    r.status === 200 && r.data?.available === true && r.data?.role === 'TEACHER' && /^https:\/\/t\.me\//.test(r.data?.url || ''),
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  r = await req('GET', '/users/me/telegram', { token: sToken });
  ok(
    'student telegram status returns link',
    r.status === 200 && r.data?.available === true && r.data?.role === 'STUDENT' && !!r.data?.url,
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // webhook /start <token> o'quvchini ulaydi
  r = await req('POST', `/students/${sUserId}/telegram-link`, { token: tToken });
  const sLinkToken = r.data?.token;
  r = await req('POST', '/telegram/webhook', {
    body: { message: { chat: { id: 990002 }, text: `/start ${sLinkToken}` } },
    headers: tgSecret ? { 'x-telegram-bot-api-secret-token': tgSecret } : {},
  });
  ok('telegram webhook /start links student', (r.status === 200 || r.status === 201) && r.data?.ok === true, `${r.status}`);
  r = await req('GET', '/users/me/telegram', { token: sToken });
  ok('student telegram becomes linked after /start', r.status === 200 && r.data?.linked === true, `${r.status} ${JSON.stringify(r.data)}`);

  // webhook /oylik (ota-ona) va /davomat (o'qituvchi) routing ishlaydi
  for (const cmd of ['/oylik', '/davomat']) {
    r = await req('POST', '/telegram/webhook', {
      body: { message: { chat: { id: 990002 }, text: cmd } },
      headers: tgSecret ? { 'x-telegram-bot-api-secret-token': tgSecret } : {},
    });
    ok(`telegram webhook ${cmd} ok`, (r.status === 200 || r.status === 201) && r.data?.ok === true, `${r.status}`);
  }

  r = await req('POST', '/users/me/telegram/unlink', { token: sToken });
  ok('student self telegram unlink', (r.status === 200 || r.status === 201) && r.data?.linked === false, `${r.status}`);

  // --- to'lov eslatmalari cron endpointi (ulangan ota-ona yo'q -> yuborilmaydi) ---
  r = await req('POST', '/cron/payment-reminders', {});
  ok('payment reminders endpoint ok', (r.status === 200 || r.status === 201) && typeof r.data?.sent === 'number', `${r.status} ${JSON.stringify(r.data)}`);

  // --- (yangi) qo'lda to'lov eslatmalarini yuborish (o'qituvchi) ---
  r = await req('POST', '/payments/remind?year=2026&month=10', { token: tToken });
  ok(
    'teacher manual reminders run',
    (r.status === 200 || r.status === 201) && typeof r.data?.sent === 'number',
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  // --- (yangi) dars eslatmalarini tekshirish (autentifikatsiyalangan tick) ---
  r = await req('POST', '/notifications/lesson-check', { token: sToken });
  ok('lesson-check endpoint ok', (r.status === 200 || r.status === 201) && r.data?.ok === true, `${r.status} ${JSON.stringify(r.data)}`);

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

  // --- presence: conversations/contacts expose an `online` field ---
  r = await req('GET', '/chat/conversations', { token: tToken });
  const convsOnline = r.data?.items || r.data?.data || r.data;
  ok(
    'conversations include online flag for otherUser',
    r.status === 200 &&
      Array.isArray(convsOnline) &&
      convsOnline.every((c) => c.otherUser === null || typeof c.otherUser.online === 'boolean'),
    `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`,
  );
  r = await req('GET', '/chat/contacts', { token: tToken });
  ok(
    'contacts include online flag',
    r.status === 200 && Array.isArray(r.data) && r.data.every((c) => typeof c.online === 'boolean'),
    `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`,
  );

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

  // --- materials via chunk-uploaded URLs (frontend's primary path) ---
  const imgChunk = new FormData();
  imgChunk.append('uploadId', `mimg_${uniq}`);
  imgChunk.append('chunkIndex', '0');
  imgChunk.append('totalChunks', '1');
  imgChunk.append('filename', 'pic.png');
  imgChunk.append('mimeType', 'image/png');
  imgChunk.append('size', String(new Blob(['png-bytes']).size));
  imgChunk.append('kind', 'image');
  imgChunk.append('scope', 'GROUP');
  imgChunk.append('scopeId', groupId);
  imgChunk.append('file', new Blob(['png-bytes'], { type: 'image/png' }), 'pic.png');
  r = await req('POST', '/files/upload', { token: tToken, form: imgChunk });
  const matImgUrl = r.data?.file?.url;
  const matImgFd = new FormData();
  matImgFd.append('groupId', groupId);
  matImgFd.append('title', `MatURL ${uniq}`);
  matImgFd.append('type', 'IMAGE');
  matImgFd.append('imageUrls', JSON.stringify([matImgUrl]));
  r = await req('POST', '/materials', { token: tToken, form: matImgFd });
  ok(
    'material image create via imageUrls',
    (r.status === 201 || r.status === 200) && (r.data?.imageUrls || []).includes(matImgUrl),
    `${r.status} ${JSON.stringify(r.data)}`,
  );

  const matImgBadFd = new FormData();
  matImgBadFd.append('groupId', groupId);
  matImgBadFd.append('title', `MatBad ${uniq}`);
  matImgBadFd.append('type', 'IMAGE');
  matImgBadFd.append('imageUrls', JSON.stringify(['/api/files/not-a-real-id']));
  r = await req('POST', '/materials', { token: tToken, form: matImgBadFd });
  ok('material foreign imageUrl rejected (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

  const vidChunk = new FormData();
  vidChunk.append('uploadId', `mvid_${uniq}`);
  vidChunk.append('chunkIndex', '0');
  vidChunk.append('totalChunks', '1');
  vidChunk.append('filename', 'clip.mp4');
  vidChunk.append('mimeType', 'video/mp4');
  vidChunk.append('size', String(new Blob(['mp4-bytes']).size));
  vidChunk.append('kind', 'video');
  vidChunk.append('scope', 'GROUP');
  vidChunk.append('scopeId', groupId);
  vidChunk.append('file', new Blob(['mp4-bytes'], { type: 'video/mp4' }), 'clip.mp4');
  r = await req('POST', '/files/upload', { token: tToken, form: vidChunk });
  const matVidUrl = r.data?.file?.url;
  const matVidFd = new FormData();
  matVidFd.append('groupId', groupId);
  matVidFd.append('title', `VidURL ${uniq}`);
  matVidFd.append('type', 'VIDEO');
  matVidFd.append('videoSource', 'UPLOAD');
  matVidFd.append('fileUrl', matVidUrl);
  r = await req('POST', '/materials', { token: tToken, form: matVidFd });
  ok(
    'material video create via fileUrl',
    (r.status === 201 || r.status === 200) && r.data?.fileUrl === matVidUrl,
    `${r.status} ${JSON.stringify(r.data)}`,
  );

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
