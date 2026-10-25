import { useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { useGetDisputeReference } from '../hooks/useGetDisputeReference';
import { useGetDisputeRelatedReferences } from '../hooks/useGetDisputeRelatedReferences';
import {
  CATEGORY_LABELS,
  OUTCOME_TITLE,
  splitSections,
  toApplyQuestion,
  TYPE_LABELS,
} from '../utils/disputeReference';
import { isUnauthorizedError, toApiError } from '../utils/apiError';

const Section = ({ title, children }) => (
  <section className="rounded-card border border-line bg-surface p-4 lg:p-5">
    <h3 className="text-label font-semibold text-ink">{title}</h3>
    <div className="mt-2 whitespace-pre-wrap text-body text-ink">{children}</div>
  </section>
);

// 사례 상세: 본문을 구간(상황·주장·쟁점·검토)별 카드로 나누고, 결과·출처·관련 자료를 이어 보여 준다.
export const DisputeReferenceDetailPage = () => {
  const { referenceId } = useParams();
  const { askAi, openReference, goBack, onUnauthorized } = useOutletContext();
  const detail = useGetDisputeReference(referenceId);
  const related = useGetDisputeRelatedReferences(referenceId);

  // 관련 자료를 눌러 다른 사례로 넘어가면 맨 위부터 보여 준다.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [referenceId]);

  useEffect(() => {
    if (isUnauthorizedError(detail.error)) onUnauthorized?.();
  }, [detail.error, onUnauthorized]);

  const reference = detail.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-input text-ink transition-colors hover:bg-surface-2"
        >
          <ChevronLeft size={22} />
        </button>
        <p className="text-card font-semibold text-ink">사례 상세</p>
      </div>

      {detail.isLoading && <p className="py-6 text-center text-body text-ink-3">자료를 불러오는 중…</p>}

      {detail.error && !isUnauthorizedError(detail.error) && (
        <p role="alert" className="rounded-card border border-crit bg-crit-soft px-4 py-3 text-body text-crit-ink">
          {toApiError(detail.error).message}
        </p>
      )}

      {reference && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge>{TYPE_LABELS[reference.type] ?? '참고자료'}</Badge>
              <Badge>{CATEGORY_LABELS[reference.category]}</Badge>
            </div>
            <h2 className="break-keep text-page-sm font-bold text-ink">{reference.title}</h2>
            <p className="text-body text-ink-2">{reference.summary}</p>
          </div>

          {splitSections(reference.content, reference.type).map(({ title, body }, i) => (
            <Section key={`${title}-${i}`} title={title}>
              {body}
            </Section>
          ))}

          {reference.outcome && <Section title={OUTCOME_TITLE[reference.type] ?? '결과'}>{reference.outcome}</Section>}

          <section className="rounded-card border border-line bg-surface p-4 lg:p-5">
            <h3 className="text-label font-semibold text-ink">출처</h3>
            <dl className="mt-2 space-y-1.5 text-body">
              {reference.caseNumber && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-ink-3">사건번호</dt>
                  <dd className="font-num tabular-nums text-ink">{reference.caseNumber}</dd>
                </div>
              )}
              {reference.relatedLaws.length > 0 && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-ink-3">관련 법령</dt>
                  <dd className="text-ink">{reference.relatedLaws.join(', ')}</dd>
                </div>
              )}
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-ink-3">자료</dt>
                <dd className="text-ink">
                  {reference.sourceTitle}
                  {reference.sourcePage && <span className="font-num tabular-nums"> p.{reference.sourcePage}</span>}
                </dd>
              </div>
            </dl>
          </section>

          {related.data?.length > 0 && (
            <section className="rounded-card border border-line bg-surface p-4 lg:p-5">
              <h3 className="text-label font-semibold text-ink">
                관련 자료 <span className="font-num tabular-nums">{related.data.length}</span>
              </h3>
              <ul className="mt-2 divide-y divide-line">
                {related.data.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openReference(item.id)}
                      className="flex min-h-11 w-full items-center gap-3 py-3 text-left"
                    >
                      <FileText size={18} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium text-ink">{item.title}</span>
                        <span className="mt-0.5 block text-sub text-ink-2">
                          {TYPE_LABELS[item.type]} · {CATEGORY_LABELS[item.category]}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-ink-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <LegalNotice />

          <div className="sticky bottom-0 -mx-1 bg-ground px-1 pb-1 pt-2">
            <Button size="lg" onClick={() => askAi(toApplyQuestion(reference))} className="w-full">
              내 상황에 적용해 보기
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
