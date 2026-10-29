import React, { useState } from 'react';
import { FileText, Sparkles, Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';

type Question = { question: string; options: string[]; correctAnswer: number; explanation: string };
type Result = { subject: string; topic: string; difficulty: string; questions: Question[]; generatedCount: number; requiresTeacherReview: boolean };

export function AiTestGeneratorPage() {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [materialText, setMaterialText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);
    if (!subject.trim() || !topic.trim()) { setError('Fan va mavzuni kiriting.'); return; }
    if (!materialText.trim() && !file) { setError('Dars matnini kiriting yoki PDF/DOCX fayl yuklang.'); return; }
    const data = new FormData();
    data.append('subject', subject.trim());
    data.append('topic', topic.trim());
    data.append('questionCount', String(questionCount));
    data.append('difficulty', difficulty);
    if (materialText.trim()) data.append('materialText', materialText.trim());
    if (file) data.append('file', file);
    setLoading(true);
    try {
      const response = await api.post<Result>('/ai-tests/generate', data);
      setResult(response.data);
    } catch (e) {
      setError(errMsg(e, 'Test yaratib bo‘lmadi. Qayta urinib ko‘ring.'));
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (index: number, patch: Partial<Question>) => {
    setResult((old) => old ? { ...old, questions: old.questions.map((q, i) => i === index ? { ...q, ...patch } : q) } : old);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <div className="flex items-center gap-2 text-indigo-600"><Sparkles className="h-5 w-5" /><span className="text-sm font-semibold">USTOZAI · AI</span></div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">AI test generator</h1>
        <p className="mt-1 text-sm text-slate-500">Dars materialidan testlar yarating, tekshiring va tahrirlang.</p>
      </header>

      <form onSubmit={generate} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Fan
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} required placeholder="Masalan: Ingliz tili" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent p-3 outline-none focus:border-indigo-500" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Mavzu
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={240} required placeholder="Masalan: Present Perfect" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent p-3 outline-none focus:border-indigo-500" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Savollar soni
            <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent p-3">
              {[5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n} ta</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Qiyinlik
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent p-3">
              <option value="EASY">Oson</option><option value="MEDIUM">O‘rtacha</option><option value="HARD">Qiyin</option>
            </select>
          </label>
        </div>

        <label className="block space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <span>Dars materiali (kamida 80 ta belgi)</span>
          <textarea value={materialText} onChange={(e) => setMaterialText(e.target.value)} maxLength={12000} rows={6} placeholder="Dars matnini shu yerga joylashtiring..." className="w-full rounded-xl border border-slate-300 bg-transparent p-3 outline-none focus:border-indigo-500" />
        </label>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm hover:border-indigo-500">
            <Upload className="h-5 w-5 text-indigo-600" />
            <span className="flex-1"><strong>PDF yoki Word (.docx)</strong><br /><span className="text-slate-500">Maksimal 8 MB</span></span>
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => { const next = e.target.files?.[0] || null; if (next && next.size > 8 * 1024 * 1024) { setError('Fayl hajmi 8 MB dan oshmasligi kerak.'); setFile(null); } else { setError(''); setFile(next); } }} />
          </label>
          {file && <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800"><FileText className="h-4 w-4" /><span className="flex-1 truncate">{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Faylni olib tashlash"><X className="h-4 w-4" /></button></div>}
        </div>

        {error && <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Test yaratilmoqda...</> : <><Sparkles className="h-5 w-5" /> AI yordamida test yaratish</>}
        </button>
      </form>

      {result && <section className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><CheckCircle2 className="h-5 w-5 shrink-0" /><div><strong>{result.generatedCount} ta savol yaratildi.</strong><p>Tarqatishdan oldin javoblar va izohlarni tekshiring. Hozircha bu savollar qoralama ko‘rinishida.</p></div></div>
        {result.questions.map((q, i) => <article key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <label className="block text-sm font-semibold">Savol {i + 1}<textarea value={q.question} onChange={(e) => updateQuestion(i, { question: e.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-3 font-normal" /></label>
          <div className="space-y-2">{q.options.map((option, j) => <div key={j} className="flex items-center gap-2"><input type="radio" name={'correct-' + i} checked={q.correctAnswer === j} onChange={() => updateQuestion(i, { correctAnswer: j })} aria-label={'To‘g‘ri javob ' + (j + 1)} /><input value={option} onChange={(e) => updateQuestion(i, { options: q.options.map((v, k) => k === j ? e.target.value : v) })} className="w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm" /><span className="text-xs text-slate-400">{String.fromCharCode(65 + j)}</span></div>)}</div>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Izoh<textarea value={q.explanation} onChange={(e) => updateQuestion(i, { explanation: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2" /></label>
        </article>)}
      </section>}
    </div>
  );
}
