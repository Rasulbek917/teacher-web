import React, { useEffect, useState } from 'react';
import { Modal, Button, Input, Textarea, Badge } from './ui';
import { fileUrl } from '../lib/api';
import { useI18n } from '../i18n/i18n';
import type { Submission } from '../lib/types';

/**
 * Soddalashtirilgan baholash modali.
 * Faqat: o'quvchi ismi, baho (0–100) va ixtiyoriy izoh.
 */
export function GradeModal({
  open,
  onClose,
  studentName,
  submission,
  initialGrade,
  initialComment,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  studentName?: string;
  submission?: Submission | null;
  initialGrade?: number | null;
  initialComment?: string | null;
  saving?: boolean;
  onSave: (grade: number | null, comment: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [grade, setGrade] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    const g = submission?.grade ?? initialGrade ?? null;
    setGrade(g === null || g === undefined ? '' : String(g));
    setComment(submission?.comment ?? initialComment ?? '');
  }, [open, submission, initialGrade, initialComment]);

  const parsed = grade === '' ? null : parseInt(grade, 10);
  const gradeError =
    grade !== '' && (Number.isNaN(parsed!) || parsed! < 0 || parsed! > 100);

  const alreadyGraded =
    submission?.result != null || submission?.grade != null || (initialGrade ?? null) != null;

  const submit = async () => {
    if (gradeError) return;
    await onSave(parsed, comment.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadyGraded ? t('editGrade') : t('putGrade')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} loading={saving} disabled={gradeError}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {studentName && (
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {studentName}
            </span>
          </div>
        )}

        {submission?.text && (
          <div className="rounded-xl bg-slate-100 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {submission.text}
          </div>
        )}
        {submission?.fileUrl && (
          <a
            href={fileUrl(submission.fileUrl)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium text-primary-600 underline dark:text-primary-300"
          >
            {t('attachment')}
          </a>
        )}

        <Input
          label={t('gradeRange')}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="0–100"
          error={gradeError ? t('gradeRange') : undefined}
          autoFocus
        />

        <Textarea
          label={t('commentOptional')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('commentOptional')}
          className="min-h-[72px]"
        />

        {submission?.result && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Badge color="indigo">{t('statusReviewed')}</Badge>
            <span>{t('editGrade')}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
