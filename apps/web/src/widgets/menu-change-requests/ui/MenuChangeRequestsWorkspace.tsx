'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { BellRing, CheckCheck, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import {
  useMarkMenuChangeRequestReviewed,
  useMenuChangeRequest,
  useMenuChangeRequestSchools,
  useMenuChangeRequests,
} from '@/entities/menu-change-request/api/MenuChangeRequestQueries';
import type {
  MenuChangeRequest,
  MenuChangeRequestStatus,
} from '@/entities/menu-change-request/model/MenuChangeRequest';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

import { MenuChangeRequestDialog } from './MenuChangeRequestDialog';

export function MenuChangeRequestsWorkspace({ initialRequestId }: { initialRequestId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<MenuChangeRequestStatus>('pending');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(initialRequestId ?? null);
  const [hasDeepLink, setHasDeepLink] = useState(Boolean(initialRequestId));
  const attemptedReviewId = useRef<string | null>(null);

  const shouldLoadList = status === 'pending' || selectedSchoolId !== '';
  const requests = useMenuChangeRequests(
    {
      offset: 0,
      limit: 100,
      status,
      schoolId: status === 'reviewed' ? selectedSchoolId || undefined : undefined,
    },
    shouldLoadList
  );
  const schools = useMenuChangeRequestSchools();
  const requestDetails = useMenuChangeRequest(activeRequestId);
  const markReviewed = useMarkMenuChangeRequestReviewed();
  const markAsReviewed = markReviewed.mutateAsync;

  useEffect(() => {
    const request = requestDetails.data;
    if (
      !activeRequestId ||
      request?.status !== 'pending' ||
      attemptedReviewId.current === activeRequestId
    ) {
      return;
    }
    attemptedReviewId.current = activeRequestId;
    void markAsReviewed(activeRequestId).catch((error) => {
      toast.error(getApiErrorMessage(error));
    });
  }, [activeRequestId, markAsReviewed, requestDetails.data]);

  const openRequest = (requestId: string) => {
    attemptedReviewId.current = null;
    setActiveRequestId(requestId);
  };

  const closeRequest = () => {
    attemptedReviewId.current = null;
    setActiveRequestId(null);
    if (hasDeepLink) {
      setHasDeepLink(false);
      router.replace('/admin/menu-changes', { scroll: false });
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Технолог</p>
        <h1 className="nf-title">Зміни меню від шкіл</h1>
        <p className="nf-description">
          Відкрийте повідомлення, щоб переглянути повне порівняння. Зміни кількості дітей сюди не
          потрапляють.
        </p>
      </header>

      <div
        className="mb-5 inline-grid w-full grid-cols-2 border border-slate-300 bg-slate-100 p-1 sm:w-80"
        role="tablist"
        aria-label="Статус змін"
      >
        <TabButton active={status === 'pending'} onClick={() => setStatus('pending')}>
          Вхідні
        </TabButton>
        <TabButton
          active={status === 'reviewed'}
          onClick={() => {
            setStatus('reviewed');
            setSelectedSchoolId('');
          }}
        >
          Переглянуті
        </TabButton>
      </div>

      {status === 'reviewed' ? (
        <section className="nf-panel mb-5">
          <div className="nf-panel-body">
            <label className="nf-label" htmlFor="reviewed-school">
              Школа
            </label>
            {schools.isPending ? (
              <LoadingSpinner className="mt-2" size="sm" label="Завантажуємо школи…" />
            ) : (
              <select
                id="reviewed-school"
                className="nf-input mt-2 max-w-md"
                value={selectedSchoolId}
                disabled={schools.isError}
                onChange={(event) => setSelectedSchoolId(event.target.value)}
              >
                <option value="">Оберіть школу</option>
                {schools.data?.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            )}
            {schools.isError ? (
              <div className="mt-3">
                <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {status === 'reviewed' && !selectedSchoolId ? (
        <EmptyState text="Оберіть школу, щоб переглянути історію змін." />
      ) : null}

      {shouldLoadList && requests.isPending ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <LoadingSpinner label="Завантажуємо зміни…" />
          </div>
        </section>
      ) : null}

      {shouldLoadList && requests.isError ? (
        <RequestError error={requests.error} onRetry={() => void requests.refetch()} />
      ) : null}

      {shouldLoadList && requests.data?.items.length === 0 ? (
        <EmptyState
          text={
            status === 'pending'
              ? 'Нових змін страв від шкіл немає.'
              : 'Для цієї школи переглянутих змін поки немає.'
          }
        />
      ) : null}

      {shouldLoadList ? (
        <div className="space-y-3">
          {requests.data?.items.map((request) => (
            <ChangeRequestSummary
              key={request.id}
              request={request}
              onOpen={() => openRequest(request.id)}
            />
          ))}
        </div>
      ) : null}

      <MenuChangeRequestDialog
        open={activeRequestId !== null}
        request={requestDetails.data}
        loading={requestDetails.isPending}
        error={requestDetails.isError ? requestDetails.error : null}
        onRetry={() => void requestDetails.refetch()}
        onClose={closeRequest}
      />
    </main>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`min-h-9 px-4 text-sm font-bold transition-colors ${
        active
          ? 'bg-white text-emerald-800 shadow-sm'
          : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChangeRequestSummary({
  request,
  onOpen,
}: {
  request: MenuChangeRequest;
  onOpen: () => void;
}) {
  const pending = request.status === 'pending';
  const changedDishCount = new Set(
    request.changes.map((change) => `${change.weekday}:${change.position}`)
  ).size;
  const dateLabel = getChangedDateLabel(request);

  return (
    <button
      type="button"
      className={`group flex w-full items-center gap-4 border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
        pending ? 'border-amber-200' : 'border-slate-200'
      }`}
      aria-label={`Переглянути зміни від школи ${request.school_name}`}
      onClick={onOpen}
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center border ${
          pending
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}
      >
        {pending ? (
          <BellRing className="size-5" aria-hidden />
        ) : (
          <CheckCheck className="size-5" aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-slate-900">{request.school_name}</span>
          {pending ? (
            <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Нове
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm text-slate-700">
          Внесла зміни до денного меню за {dateLabel}
        </span>
        <span className="mt-1 block text-xs text-slate-500">
          {request.menu_title} · змінено страв: {changedDishCount} ·{' '}
          {formatDate(request.created_at)}
        </span>
      </span>

      <ChevronRight
        className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-700"
        aria-hidden
      />
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <section className="nf-panel">
      <div className="nf-panel-body">
        <div className="nf-empty">{text}</div>
      </div>
    </section>
  );
}

function getChangedDateLabel(request: MenuChangeRequest): string {
  const changedWeekdays = new Set(request.changes.map((change) => change.weekday));
  const dates = request.days_snapshot
    .flatMap((day) => (changedWeekdays.has(day.weekday) && day.date ? [day.date] : []))
    .sort();
  if (dates.length > 0) {
    return dates.map(formatDayDate).join(', ');
  }
  return request.starts_on ? formatDayDate(request.starts_on) : 'дату меню';
}

function formatDayDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
