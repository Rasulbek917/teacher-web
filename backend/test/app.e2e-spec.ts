import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Teacher Web — asosiy oqimlar uchun e2e testlar.
 * Haqiqiy PostgreSQL bazasiga ulanadi (backend/.env -> DATABASE_URL).
 */
jest.setTimeout(60000);

const U = Date.now();
const PWD = 'test1234';

let app: INestApplication;
let prisma: PrismaService;
let notifications: NotificationsService;
let http: any;

let saToken = '';
let t1Token = '';
let t2Token = '';
let sToken = '';

let t1Id = '';
let t2Id = '';
let t3Id = '';
let group1 = '';
let group2 = '';
let student1 = '';
let hw1 = '';

const t1Login = `e2e_t1_${U}`;
const t2Login = `e2e_t2_${U}`;
const t3Login = `e2e_t3_${U}`;
const sLogin = `e2e_s1_${U}`;
const ATT_DATE = '2026-10-06';

const srv = () => request(http);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function makeTeacher(login: string) {
  const res = await srv()
    .post('/api/auth/register-teacher')
    .send({
      login,
      password: PWD,
      confirmPassword: PWD,
      firstName: 'Test',
      lastName: 'Teacher',
      phone: '+998 90 000 11 22',
      email: `${login}@example.com`,
      centerName: 'E2E Center',
      city: 'Toshkent',
    });
  expect([200, 201]).toContain(res.status);
  const li = await srv().post('/api/auth/login').send({ login, password: PWD });
  expect([200, 201]).toContain(li.status);
  return { token: li.body.token as string, id: li.body.user.id as string };
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  prisma = app.get(PrismaService);
  notifications = app.get(NotificationsService);
  http = app.getHttpServer();

  const login = await srv()
    .post('/api/auth/login')
    .send({ login: 'superadmin', password: 'superadmin123' });
  expect([200, 201]).toContain(login.status);
  saToken = login.body.token;
});

afterAll(async () => {
  await app?.close();
});

describe('1. Login va ruxsatlar', () => {
  it('superadmin login ishlaydi', () => {
    expect(saToken).toBeTruthy();
  });

  it("noto'g'ri parol 401 qaytaradi", async () => {
    const res = await srv()
      .post('/api/auth/login')
      .send({ login: 'superadmin', password: 'notogri' });
    expect(res.status).toBe(401);
  });

  it("o'qituvchi ro'yxatdan o'tib kira oladi", async () => {
    const a = await makeTeacher(t1Login);
    t1Token = a.token;
    t1Id = a.id;
    const b = await makeTeacher(t2Login);
    t2Token = b.token;
    t2Id = b.id;
    expect(t1Token && t2Token).toBeTruthy();
  });

  it('guruh va oquvchi yaratiladi', async () => {
    const g1 = await srv()
      .post('/api/groups')
      .set(bearer(t1Token))
      .send({ name: `G1 ${U}`, level: 'Beginner', lessonDays: [1, 3, 5], lessonTime: '14:00', monthlyPrice: 300000 });
    expect([200, 201]).toContain(g1.status);
    group1 = g1.body.id;

    const g2 = await srv()
      .post('/api/groups')
      .set(bearer(t2Token))
      .send({ name: `G2 ${U}`, level: 'Beginner', lessonDays: [2, 4], lessonTime: '16:00', monthlyPrice: 250000 });
    group2 = g2.body.id;

    const s = await srv()
      .post('/api/students')
      .set(bearer(t1Token))
      .send({
        firstName: 'E2E', lastName: 'Student',
        phone: '+998 90 555 11 22', parentPhone: '+998 90 555 11 33',
        login: sLogin, password: PWD, memberships: [{ groupId: group1 }],
      });
    expect([200, 201]).toContain(s.status);
    student1 = s.body.id;

    const sl = await srv().post('/api/auth/login').send({ login: sLogin, password: PWD });
    expect([200, 201]).toContain(sl.status);
    sToken = sl.body.token;
  });

  it('student /groups va /admin/dashboard ga kira olmaydi (403)', async () => {
    expect((await srv().get('/api/groups').set(bearer(sToken))).status).toBe(403);
    expect((await srv().get('/api/admin/dashboard').set(bearer(sToken))).status).toBe(403);
  });

  it("teacher /admin/dashboard ga kira olmaydi (403)", async () => {
    expect((await srv().get('/api/admin/dashboard').set(bearer(t1Token))).status).toBe(403);
  });

  it("student o'z guruhini /my/groups orqali ko'radi", async () => {
    const res = await srv().get('/api/my/groups').set(bearer(sToken));
    expect(res.status).toBe(200);
    const ids = (Array.isArray(res.body) ? res.body : res.body.items).map((g: any) => g.id);
    expect(ids).toContain(group1);
  });
});

describe('2. Davomat takrorlanmasligi (unique)', () => {
  it('bir xil sanada ikki marta saqlanganda bitta yozuv qoladi', async () => {
    await srv()
      .post('/api/attendance')
      .set(bearer(t1Token))
      .send({ groupId: group1, date: ATT_DATE, records: [{ studentId: student1, present: true }] })
      .expect((r) => expect([200, 201]).toContain(r.status));

    await srv()
      .post('/api/attendance')
      .set(bearer(t1Token))
      .send({ groupId: group1, date: ATT_DATE, records: [{ studentId: student1, present: false }] })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const count = await prisma.attendance.count({
      where: { studentId: student1, groupId: group1, date: new Date(ATT_DATE) },
    });
    expect(count).toBe(1);

    const res = await srv().get(`/api/attendance?groupId=${group1}&date=${ATT_DATE}`).set(bearer(t1Token));
    expect(res.status).toBe(200);
    expect(res.body.students[0].present).toBe(false);
  });
});

describe('3. Davomat sahifasida uy vazifasi holati', () => {
  it('topshirilmagan -> PENDING, topshirilgach -> SUBMITTED', async () => {
    const hw = await srv()
      .post('/api/homework')
      .set(bearer(t1Token))
      .send({ groupId: group1, title: `HW ${U}`, description: 'Test', dueAt: '2026-11-30T00:00:00.000Z' });
    expect([200, 201]).toContain(hw.status);
    hw1 = hw.body.id;

    let res = await srv()
      .get(`/api/attendance?groupId=${group1}&date=${ATT_DATE}&homeworkId=${hw1}`)
      .set(bearer(t1Token));
    expect(res.status).toBe(200);
    expect(res.body.selectedHomework.id).toBe(hw1);
    expect(res.body.students[0].homeworkStatus).toBe('PENDING');

    await srv()
      .post(`/api/my/homework/${hw1}/submit`)
      .set(bearer(sToken))
      .send({ text: 'Bajarildi' })
      .expect((r) => expect([200, 201]).toContain(r.status));

    res = await srv()
      .get(`/api/attendance?groupId=${group1}&date=${ATT_DATE}&homeworkId=${hw1}`)
      .set(bearer(t1Token));
    expect(res.body.students[0].homeworkStatus).toBe('SUBMITTED');
    expect(res.body.students[0].submission).toBeTruthy();
  });
});

describe("4. Faqat o'z guruhini baholash", () => {
  let subId = '';

  it("boshqa o'qituvchi topshiriqni ko'ra/baholay olmaydi", async () => {
    // t2 o'z guruhida emas -> 403
    const forbidden = await srv().get(`/api/submissions/homework/${hw1}`).set(bearer(t2Token));
    expect(forbidden.status).toBe(403);

    const ok = await srv().get(`/api/submissions/homework/${hw1}`).set(bearer(t1Token));
    expect(ok.status).toBe(200);
    const row = ok.body.students.find((s: any) => s.submission);
    expect(row).toBeTruthy();
    subId = row.submission.id;

    // t2 review -> 403
    const bad = await srv()
      .patch(`/api/submissions/${subId}/review`)
      .set(bearer(t2Token))
      .send({ result: 'DONE', grade: 5 });
    expect(bad.status).toBe(403);

    const good = await srv()
      .patch(`/api/submissions/${subId}/review`)
      .set(bearer(t1Token))
      .send({ result: 'DONE', grade: 5, comment: 'Yaxshi' });
    expect(good.status).toBe(200);
    expect(good.body.submission ? good.body.submission.grade : good.body.grade).toBe(5);
  });
});

describe('5. Haftalik / oylik statistika', () => {
  it('group statistics week va month qaytaradi', async () => {
    const res = await srv()
      .get(`/api/statistics/group?groupId=${group1}&date=${ATT_DATE}`)
      .set(bearer(t1Token));
    expect(res.status).toBe(200);
    expect(res.body.week).toBeDefined();
    expect(res.body.month).toBeDefined();
    expect(res.body.week.totals).toBeDefined();
    expect(typeof res.body.week.totals.attendancePct).toBe('number');
    // Haftalik davomatda kamida 1 ta dars (davomat yozuvi) bor
    expect(res.body.week.totals.lessonsCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.week.students)).toBe(true);
  });
});

describe("6. To'lovlar summasi", () => {
  it("mark-paid va sum to'g'ri hisoblanadi", async () => {
    const r1 = await srv()
      .post('/api/payments/mark-paid')
      .set(bearer(t1Token))
      .send({ studentId: student1, groupId: group1, periodYear: 2026, periodMonth: 10, amount: 300000 });
    expect([200, 201]).toContain(r1.status);

    const r2 = await srv()
      .post('/api/payments/mark-paid')
      .set(bearer(t1Token))
      .send({ studentId: student1, groupId: group1, periodYear: 2026, periodMonth: 9, amount: 150000 });
    expect([200, 201]).toContain(r2.status);

    const list = await srv().get('/api/payments?year=2026&month=10').set(bearer(t1Token));
    expect(list.status).toBe(200);
    expect(list.body.sum).toBe(300000);

    const list9 = await srv().get('/api/payments?year=2026&month=9').set(bearer(t1Token));
    expect(list9.body.sum).toBe(150000);
  });
});

describe('7. Oquvchi ochirilganda tolov saqlanadi', () => {
  it('student delete -> payment studentId null, studentName saqlanadi', async () => {
    await srv().delete(`/api/students/${student1}`).set(bearer(t1Token));
    // account deleted? student1 in only one group -> deleted
    const user = await prisma.user.findUnique({ where: { id: student1 } });
    expect(user).toBeNull();

    const payments = await prisma.payment.findMany({ where: { studentName: 'E2E Student' } });
    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(payments.every((p) => p.studentId === null)).toBe(true);
    expect(payments[0].studentName).toBe('E2E Student');
  });
});

describe("8. O'qituvchi ochirilganda kaskad", () => {
  it('teacher delete -> guruh va eksklyuziv oquvchilar ochiriladi', async () => {
    const t3 = await makeTeacher(t3Login);
    t3Id = t3.id;

    const g3 = await srv()
      .post('/api/groups')
      .set(bearer(t3.token))
      .send({ name: `G3 ${U}`, level: 'Beginner', lessonDays: [6], lessonTime: '10:00', monthlyPrice: 200000 });
    expect([200, 201]).toContain(g3.status);
    const group3 = g3.body.id;

    const s3 = await srv()
      .post('/api/students')
      .set(bearer(t3.token))
      .send({
        firstName: 'Excl', lastName: 'Student',
        phone: '+998 90 777 11 22', parentPhone: '+998 90 777 11 33',
        login: `e2e_s3_${U}`, password: PWD, memberships: [{ groupId: group3 }],
      });
    expect([200, 201]).toContain(s3.status);
    const student3 = s3.body.id;

    const del = await srv()
      .delete(`/api/teachers/${t3Id}`)
      .set(bearer(saToken))
      .send({ login: t3Login });
    expect([200, 201]).toContain(del.status);

    expect(await prisma.user.findUnique({ where: { id: t3Id } })).toBeNull();
    expect(await prisma.group.findUnique({ where: { id: group3 } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: student3 } })).toBeNull();
  });
});

describe("9. Bildirishnoma bir marta yuboriladi (dedupe)", () => {
  it('bir xil dedupeKey ikkinchi marta yaratilmaydi', async () => {
    const key = `e2e-notif-${U}`;
    const first = await notifications.create({
      userId: t1Id,
      type: 'HOMEWORK_SUBMITTED' as any,
      title: 'Test',
      body: 'Test body',
      dedupeKey: key,
    });
    expect(first).not.toBeNull();

    const second = await notifications.create({
      userId: t1Id,
      type: 'HOMEWORK_SUBMITTED' as any,
      title: 'Test',
      body: 'Test body',
      dedupeKey: key,
    });
    expect(second).toBeNull();

    const count = await prisma.notification.count({ where: { dedupeKey: key } });
    expect(count).toBe(1);
  });
});
