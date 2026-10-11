import type { ApiStatus } from './types';

export type BadgeColor = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'indigo' | 'violet' | 'cyan';

export interface StatusMeta {
  /** i18n kaliti */
  key: string;
  color: BadgeColor;
}

/**
 * Soddalashtirilgan 4 holat:
 *  Berildi / Topshirildi / Tekshirildi / Muddati o'tdi
 */
export function submissionStatusMeta(reviewed: boolean, status: ApiStatus): StatusMeta {
  if (reviewed) return { key: 'statusReviewed', color: 'green' };
  if (status === 'SUBMITTED' || status === 'LATE') {
    return { key: 'statusSubmitted', color: 'blue' };
  }
  if (status === 'MISSING') return { key: 'statusOverdue', color: 'red' };
  return { key: 'statusAssigned', color: 'indigo' };
}

/** Uy vazifasi kartochkasi uchun umumiy holat. */
export function homeworkStatusMeta(opts: {
  isPastDue: boolean;
  submittedCount: number;
  uncheckedCount: number;
}): StatusMeta {
  const { isPastDue, submittedCount, uncheckedCount } = opts;
  if (submittedCount > 0 && uncheckedCount === 0) {
    return { key: 'statusReviewed', color: 'green' };
  }
  if (submittedCount > 0) return { key: 'statusSubmitted', color: 'blue' };
  if (isPastDue) return { key: 'statusOverdue', color: 'red' };
  return { key: 'statusAssigned', color: 'indigo' };
}
