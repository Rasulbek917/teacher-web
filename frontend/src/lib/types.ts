// Backend API types (backend contract bilan moslashtirilgan)

export type Role = 'SUPER_ADMIN' | 'TEACHER' | 'STUDENT';
export type Lang = 'UZ' | 'EN';
export type ThemePref = 'LIGHT' | 'DARK';
export type MaterialType = 'VIDEO' | 'IMAGE';
export type VideoSource = 'UPLOAD' | 'YOUTUBE';
export type ApiStatus = 'SUBMITTED' | 'LATE' | 'MISSING' | 'PENDING';
export type SubmissionStatus = 'SUBMITTED' | 'LATE';
export type ReviewResult = 'DONE' | 'WRONG';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type NotificationType =
  | 'LESSON_SOON'
  | 'HOMEWORK_SUBMITTED'
  | 'HOMEWORK_REVIEWED';
export type ConversationType = 'GROUP' | 'DIRECT';
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO' | 'VOICE';

export interface TeacherProfileInfo {
  centerName: string;
  city: string;
}
export interface StudentProfileInfo {
  parentPhone: string;
}

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string;
  login: string;
  avatarUrl: string | null;
  language: Lang;
  theme: ThemePref;
  isBlocked: boolean;
  createdAt: string;
  teacherProfile?: TeacherProfileInfo | null;
  studentProfile?: StudentProfileInfo | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Groups ----
export interface GroupListItem {
  id: string;
  name: string;
  level: string;
  lessonDays: number[];
  lessonTime: string;
  monthlyPrice: number;
  studentsCount: number;
  createdAt: string;
}
export interface GroupOption {
  id: string;
  name: string;
  level: string;
  monthlyPrice: number;
}
export interface GroupStudent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  login: string;
  avatarUrl: string | null;
  isBlocked: boolean;
  customPrice: number | null;
  effectivePrice: number;
}
export interface GroupDetail {
  id: string;
  name: string;
  level: string;
  lessonDays: number[];
  lessonTime: string;
  monthlyPrice: number;
  createdAt: string;
  students: GroupStudent[];
}
export interface GroupDeletionInfo {
  materialsCount: number;
  homeworksCount: number;
  studentsCount: number;
}
export interface MyGroup {
  id: string;
  name: string;
  level: string;
  lessonDays: number[];
  lessonTime: string;
  monthlyPrice: number;
  customPrice: number | null;
  effectivePrice: number;
  teacher: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

// ---- Students ----
export interface StudentGroupMember {
  id: string;
  name: string;
  customPrice: number | null;
  effectivePrice: number;
}
export interface StudentListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  parentPhone: string;
  login: string;
  avatarUrl: string | null;
  isBlocked: boolean;
  createdAt: string;
  telegramLinked?: boolean;
  groups: StudentGroupMember[];
}
export interface StudentDeletionInfo {
  groupsHere: number;
  otherGroups: number;
  paymentsCount: number;
  willDeleteAccount: boolean;
}

// ---- Teachers (admin) ----
export interface TeacherListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  login: string;
  avatarUrl: string | null;
  centerName: string;
  city: string;
  groupsCount: number;
  studentsCount: number;
  createdAt: string;
}
export interface TeacherDeletionInfo {
  teacher: { id: string; firstName: string; lastName: string; login: string };
  groupsCount: number;
  studentsCount: number;
}

// ---- Materials ----
export interface MaterialItem {
  id: string;
  groupId: string;
  groupName: string;
  type: MaterialType;
  title: string;
  description: string | null;
  videoSource: VideoSource | null;
  fileUrl: string | null;
  youtubeUrl: string | null;
  imageUrls: string[];
  createdAt: string;
}

// ---- Homework ----
export interface HomeworkItem {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  attachmentUrls: string[];
  createdAt: string;
  totalStudents: number;
  submittedCount: number;
  notSubmittedCount: number;
  uncheckedCount: number;
  isPastDue: boolean;
}
export interface StudentHomeworkItem {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  attachmentUrls: string[];
  status: ApiStatus;
  result: ReviewResult | null;
  grade: number | null;
  comment: string | null;
  submittedAt: string | null;
}

// ---- Submissions ----
export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  text: string | null;
  fileUrl: string | null;
  submittedAt: string;
  status: SubmissionStatus;
  result: ReviewResult | null;
  grade: number | null;
  comment: string | null;
  reviewedAt: string | null;
}
export interface HomeworkSubmissions {
  homework: {
    id: string;
    title: string;
    description: string | null;
    dueAt: string | null;
    groupId: string;
    groupName: string;
    attachmentUrls: string[];
  };
  students: {
    student: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
    submission: Submission | null;
    status: ApiStatus;
  }[];
}
export interface GroupSummaryRow {
  student: { id: string; firstName: string; lastName: string; avatarUrl: string | null; isBlocked: boolean };
  averageGrade: number | null;
  gradedCount: number;
  uncheckedCount: number;
}
export interface StudentHomeworksRow {
  homeworkId: string;
  title: string;
  dueAt: string | null;
  status: ApiStatus;
  submission: Submission | null;
}
export interface StudentHomeworkDetail {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  attachmentUrls: string[];
  status: ApiStatus;
  submission: Submission | null;
  teacherId: string;
}

// ---- Attendance ----
export interface AttendancePageData {
  group: { id: string; name: string; lessonTime: string; monthlyPrice: number };
  date: string;
  dateOnly: string;
  homeworks: { id: string; title: string; dueAt: string | null }[];
  selectedHomework: { id: string; title: string; dueAt: string | null } | null;
  students: {
    student: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
    present: boolean | null;
    homeworkStatus: ApiStatus | null;
    submission: Submission | null;
  }[];
  summary: { present: number; absent: number; submitted: number; notSubmitted: number };
}

// ---- Payments ----
export interface PaymentRow {
  studentId: string;
  student: { id: string; firstName: string; lastName: string; phone: string; avatarUrl: string | null; isBlocked: boolean };
  groupId: string;
  groupName: string;
  price: number;
  amount: number;
  status: PaymentStatus;
  paidAt: string | null;
  paymentId: string | null;
  periodYear: number;
  periodMonth: number;
}
export interface PaymentsResponse extends Paginated<PaymentRow> {
  sum: number;
  unpaid: number;
  deadline?: string | null;
}
export interface StudentPaymentMonth {
  year: number;
  month: number;
  status: PaymentStatus;
  amount: number;
  paidAt: string | null;
  price: number;
}
export interface StudentPaymentEntry {
  groupId: string;
  groupName: string;
  price: number;
  months: StudentPaymentMonth[];
}

// ---- Statistics ----
export interface StatsTotals {
  lessonsCount: number;
  attendancePct: number;
  homeworksCount: number;
  submissionPct: number;
  avgGrade: number | null;
}
export interface StatsStudent {
  student: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  present: number;
  absent: number;
  attendancePct: number;
  homework: {
    assigned: number;
    submitted: number;
    missed: number;
    late: number;
    done: number;
    wrong: number;
  };
  avgGrade: number | null;
}
export interface StatsRange {
  start: string;
  end: string;
  totals: StatsTotals;
  students: StatsStudent[];
}
export interface GroupStats {
  group: { id: string; name: string; level: string; lessonDays: number[]; lessonTime: string };
  referenceDate: string;
  week: StatsRange;
  month: StatsRange;
}
export interface StudentRangeDetail {
  range: { start: string; end: string };
  days: { date: string; present: boolean }[];
  homeworks: { id: string; title: string; dueAt: string | null; status: ApiStatus; result: ReviewResult | null; grade: number | null }[];
}
export interface MyStats {
  referenceDate: string;
  week: StatsRange;
  month: StatsRange;
  detail: StudentRangeDetail;
}

// ---- Notifications ----
export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  dedupeKey: string | null;
  createdAt: string;
}
export interface NotificationsResponse extends Paginated<NotificationItem> {
  unreadCount: number;
}

// ---- Chat ----
export interface ChatUser {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role?: Role;
  /** Hozir online (socket ulangan)mi. */
  online?: boolean;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  sender: ChatUser;
  type: MessageType;
  text: string | null;
  fileUrl: string | null;
  editedAt: string | null;
  createdAt: string;
  readBy: string[];
}
export interface ConversationItem {
  id: string;
  type: ConversationType;
  groupId: string | null;
  groupName: string | null;
  title: string;
  avatarUrl: string | null;
  otherUser: ChatUser | null;
  lastMessage: {
    text: string | null;
    type: MessageType;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  /** Hozir online (socket ulangan)mi. */
  online?: boolean;
}
export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

// ---- Dashboard ----
export interface TeacherDashboard {
  year: number;
  month: number;
  groupsCount: number;
  studentsCount: number;
  totalIncome: number;
  unpaidCount: number;
  paidList: {
    id: string;
    studentName: string;
    groupName: string;
    amount: number;
    status: PaymentStatus;
    paidAt: string | null;
  }[];
  unpaidList: {
    studentId: string;
    studentName: string;
    groupId: string;
    groupName: string;
    monthlyPrice: number;
    parentPhone: string;
    paidAmount: number;
  }[];
}
export interface AdminDashboard {
  teachersCount: number;
  groupsCount: number;
  studentsCount: number;
}