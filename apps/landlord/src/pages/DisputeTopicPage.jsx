import { useEffect } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@butler/ui';
import { FaqList } from '../components/DisputeReference/FaqList';
import { InstitutionList } from '../components/DisputeReference/InstitutionList';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { TopicGuide } from '../components/DisputeReference/TopicGuide';
import { useGetDisputeFaqList } from '../hooks/useGetDisputeFaqList';
import { useGetDisputeReferenceList } from '../hooks/useGetDisputeReferenceList';
import { findTopic } from '../utils/disputeReference';
import { findInstitutions, HELP_ROUTES, TOPIC_BRIEFINGS } from '../utils/disputePortal';
import { isUnauthorizedError } from '../utils/apiError';

const CASE_PREVIEW_COUNT = 2;
// 끝까지 보는 안내(guide)가 있는 상황은 사례를 요약과 함께 조금 더 보여 준다.
const GUIDE_CASE_COUNT = 3;
const FAQ_PREVIEW_COUNT = 3;

const SectionTitle = ({ children, action }) => (
  <div className="flex items-center justify-between gap-2">
    <h3 className="text-section font-semibold text-ink">{children}</h3>
    {action}
  </div>
);

// 상황 브리핑: 한 줄 정리와 할 일 순서를 먼저 보여 주고, 근거(사례·질문)와 기관을 짧게 붙인다.
// 사용자가 사례집을 직접 뒤지지 않아도 되게 정리한 내용이 위에 온다.
export const DisputeTopicPage = () => {
  const { topicKey } = useParams();
  const { askAi, isAiDocked, setAiSuggestions, openReference, goBack, onNavigate, onUnauthorized } = useOutletContext();
  const topic = findTopic(topicKey);
  const briefing = TOPIC_BRIEFINGS[topicKey];
  const category = topic?.categories.join(',');
  const faqs = useGetDisputeFaqList({ category });
  // 첫 화면 질문 칩에서 고른 질문(?faq=key). 다른 상황 분류의 질문일 수도 있어서 전체 질문에서 찾는다.
  const [searchParams] = useSearchParams();
  const selectedFaqKey = searchParams.get('faq');
  const allFaqs = useGetDisputeFaqList({});
  const selectedFaq = selectedFaqKey ? allFaqs.data?.find((faq) => faq.key === selectedFaqKey) : undefined;
  const cases = useGetDisputeReferenceList({
    type: 'CASE',
    category,
    size: briefing?.guide ? GUIDE_CASE_COUNT : CASE_PREVIEW_COUNT,
  });

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [topicKey]);

  // 오른쪽 AI: 이 상황 안내를 읽다가 바로 물어볼 질문
  useEffect(() => {
    if (!topic) return;
    setAiSuggestions?.([`${topic.label} 문제에서 제 경우는 어디에 해당하나요?`, `${topic.label} 안내의 어려운 말을 쉽게 설명해 주세요`]);
  }, [topic, setAiSuggestions]);

  useEffect(() => {
    if (isUnauthorizedError(faqs.error) || isUnauthorizedError(cases.error)) onUnauthorized?.();
  }, [faqs.error, cases.error, onUnauthorized]);

  if (!topic || !briefing) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-card font-semibold text-ink">없는 상황이에요</p>
        <Button variant="secondary" onClick={() => onNavigate('disputes')} className="min-h-11">
          임대차 분쟁 센터로
        </Button>
      </div>
    );
  }

  const caseItems = cases.data?.data ?? [];
  const faqItems = (faqs.data ?? []).slice(0, FAQ_PREVIEW_COUNT);
  const askAboutTopic = () => askAi(`${topic.label} 문제로 상담하고 싶어요.\n제 상황: `);
  const header = (
    <div className="flex flex-col gap-3">
      <PageHeader title={topic.label} onBack={goBack} />
      <div className="rounded-card bg-accent-soft p-4 lg:p-5">
        <p className="break-keep text-card font-semibold text-accent-strong">{briefing.headline}</p>
        <p className="mt-2 text-sub text-ink-2">근거 · {briefing.laws.join(', ')}</p>
      </div>
      {selectedFaq && (
        <section className="mt-3 flex flex-col gap-3" aria-label="고른 질문">
          <SectionTitle>고른 질문</SectionTitle>
          <FaqList key={selectedFaq.key} faqs={[selectedFaq]} onOpenReference={openReference} />
        </section>
      )}
    </div>
  );

  if (briefing.guide) {
    // 자주 묻는 질문의 근거 판례를 모아, 판례마다 어떤 질문의 근거인지(왜 관련 있는지)를 붙인다.
    const precedents = [];
    for (const faq of faqs.data ?? []) {
      for (const reference of faq.references) {
        if (reference.type === 'PRECEDENT' && !precedents.some((item) => item.reference.id === reference.id)) {
          precedents.push({ reference, question: faq.question });
        }
      }
    }
    return (
      <div className="flex flex-col gap-6">
        {header}
        <TopicGuide
          guide={briefing.guide}
          helpRoutes={HELP_ROUTES}
          cases={caseItems}
          precedents={precedents}
          onSearch={(q) => onNavigate('disputeSearch', { q })}
          onSearchPrecedent={(q) => onNavigate('disputeSearch', { q, tab: 'PRECEDENT' })}
          onOpenReference={openReference}
          // 넓은 화면은 오른쪽 AI가 있어서 맨 아래 AI 카드를 두지 않는다.
          onAsk={isAiDocked ? undefined : askAboutTopic}
        />
        <LegalNotice />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section className="flex flex-col gap-3">
        <SectionTitle>이렇게 하세요</SectionTitle>
        <div className="rounded-card border border-line bg-surface p-4 lg:p-5">
          <ol className="flex flex-col gap-2.5">
            {briefing.steps.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-body text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-num text-chip font-semibold tabular-nums text-accent-strong">
                  {i + 1}
                </span>
                <span className="break-keep">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-line pt-3 text-sub text-warn-ink">⚠ {briefing.cautions[0]}</p>
        </div>
      </section>

      {caseItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => onNavigate('disputeSearch', { topic: topic.key })}
                className="flex min-h-11 items-center gap-0.5 px-1 text-label font-semibold text-accent hover:text-accent-strong"
              >
                더 보기
                <ChevronRight size={16} />
              </button>
            }
          >
            비슷한 사례
          </SectionTitle>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {caseItems.map((reference) => (
              <li key={reference.id}>
                <button
                  type="button"
                  onClick={() => openReference(reference.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 lg:px-5"
                >
                  <FileText size={18} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-body text-ink">{reference.title}</span>
                  <ChevronRight size={16} className="shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {faqItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>자주 묻는 질문</SectionTitle>
          <FaqList key={topic.key} faqs={faqItems} onOpenReference={openReference} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>도움받을 수 있는 곳</SectionTitle>
        <InstitutionList institutions={findInstitutions(briefing.institutions)} />
      </section>

      <LegalNotice />

      {/* 넓은 화면은 오른쪽 AI(질문 칩)가 같은 일을 해서, 좁은 화면에서만 아래에 고정 버튼을 둔다. */}
      {!isAiDocked && (
        <div className="sticky bottom-0 -mx-1 bg-ground px-1 pb-1 pt-2">
          <Button size="lg" onClick={askAboutTopic} className="w-full">
            내 상황 AI에게 물어보기
          </Button>
        </div>
      )}
    </div>
  );
};
