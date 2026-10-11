// Demo ma'lumotlar (qo'lda test uchun). Idempotent emas - har chaqiruvda yangi yaratadi.
const BASE = process.env.API || 'http://localhost:3000/api';
async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { status: res.status, data };
}

const T = { login: 'teacher1', password: 'teacher123' };
const S = { login: 'student1', password: 'student123' };

async function main() {
  let r = await req('POST', '/auth/login', { body: { login: T.login, password: T.password } });
  if (r.status >= 400) {
    r = await req('POST', '/auth/register-teacher', {
      body: { login: T.login, password: T.password, confirmPassword: T.password, firstName: 'Dilnoza', lastName: 'Karimova', phone: '+998 90 123 45 67', email: 'dilnoza@example.com', centerName: 'Teacher Web Academy', city: 'Toshkent' },
    });
    console.log('register teacher', r.status);
    r = await req('POST', '/auth/login', { body: { login: T.login, password: T.password } });
  }
  const tToken = r.data.token;
  console.log('teacher token', !!tToken);

  // group
  r = await req('POST', '/groups', { token: tToken, body: { name: 'Beginner A', level: 'Beginner', lessonDays: [1, 3, 5], lessonTime: '14:00', monthlyPrice: 300000 } });
  let groupId = r.data?.id;
  if (!groupId) {
    r = await req('GET', '/groups', { token: tToken });
    groupId = (r.data.items || []).find((g) => g.name === 'Beginner A')?.id;
  }
  console.log('group', groupId);

  // student
  r = await req('POST', '/students', { token: tToken, body: { firstName: 'Sardor', lastName: 'Toshmatov', phone: '+998 90 222 33 44', parentPhone: '+998 90 222 33 55', login: S.login, password: S.password, memberships: [{ groupId }] } });
  let studentId = r.data?.id;
  if (!studentId) {
    r = await req('GET', '/students', { token: tToken });
    studentId = (r.data.items || []).find((s) => s.login === S.login)?.id;
  }
  console.log('student', r.status, studentId);

  // homework
  r = await req('POST', '/homework', { token: tToken, body: { groupId, title: 'Unit 1 - Writing', description: 'Write 10 sentences about your family.', dueAt: '2026-10-20T00:00:00.000Z' } });
  console.log('homework', r.status);

  // attendance
  r = await req('POST', '/attendance', { token: tToken, body: { groupId, date: '2026-10-08', records: [{ studentId, present: true }] } });
  console.log('attendance', r.status);

  // payment
  r = await req('POST', '/payments/mark-paid', { token: tToken, body: { studentId, groupId, periodYear: 2026, periodMonth: 10, amount: 300000 } });
  console.log('payment', r.status);

  console.log('DEMO READY:', T.login, '/', T.password, '|', S.login, '/', S.password);
}
main().catch((e) => { console.error(e); process.exit(1); });
