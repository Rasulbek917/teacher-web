import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/i18n';
import { Button } from '../components/ui';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-6xl font-black text-primary-500">404</div>
      <p className="text-lg font-medium text-slate-700 dark:text-slate-300">{t('notFound')}</p>
      <Link to="/">
        <Button>{t('backToHome')}</Button>
      </Link>
    </div>
  );
}