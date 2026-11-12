import { useEffect } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@butler/ui';
import { FaqList } from '../components/DisputeReference/FaqList';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { TopicGuide } from '../components/DisputeReference/TopicGuide';
import { useGetDisputeFaqList } from '../hooks/useGetDisputeFaqList';
import { useGetDisputeReferenceList } from '../hooks/useGetDisputeReferenceList';
import { findTopic } from '../utils/disputeReference';
import { HELP_ROUTES, TOPIC_BRIEFINGS } from '../utils/disputePortal';
import { isUnauthorizedError } from '../../../shared/apiError';

// 실제 조정 사례는 요약과 함께 3건만 보여 주고, 나머지는 자료 찾기로 잇는다.
const CASE_COUNT = 3;

const SectionTitle = ({ children }) => <h3 className="text-section font-semibold text-ink">{children}</h3>;

// 상황 안내: 한 줄 정리와 (칩으로 왔으면) 고른 질문의 답을 먼저 보여 주고, 아래에 끝까지 보는 안내(TopicGuide)를 붙인다.
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
    size: CASE_COUNT,
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
};
