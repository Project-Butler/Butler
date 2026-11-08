import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { HelpRouteCard } from '../components/DisputeReference/HelpRouteCard';
import { IssueCard } from '../components/DisputeReference/IssueCard';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { SearchBox } from '../components/DisputeReference/SearchBox';
import { TopicGuideCard } from '../components/DisputeReference/TopicGuideCard';
import { DISPUTE_TOPICS } from '../utils/disputeReference';
import { HELP_ROUTES, SEARCH_EXAMPLES, TOPIC_QUESTIONS, WEEKLY_ISSUE } from '../utils/disputePortal';

const SectionTitle = ({ children }) => <h3 className="text-section font-semibold text-ink">{children}</h3>;

// 임대차 분쟁 센터 첫 화면. 칸마다 "그래서 뭘 하면 되는지"로 이어지게 둔다.
// 검색(+ 사례·판례 전체 보기) → 유형별 질문 → 최근 이슈(임대인 영향) → 도움 요청할 곳.
// 첫 화면에는 AI 입구를 두지 않는다(찾다가 없을 때만 — DisputePage 참고).
// 서식·도구는 상황마다 다르므로 상황 안내 화면에 둔다.
// 이슈·기관은 시안이라 고정 내용이다.
export const DisputeHomePage = () => {
  const { onNavigate } = useOutletContext();
  const [keyword, setKeyword] = useState('');

  const search = (q) => onNavigate('disputeSearch', { q });
  const openTopic = (topicKey) => onNavigate('disputeTopic', { topicKey });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <PageHeader title="임대차 분쟁 센터" description="분쟁이 생겼을 때 무엇부터 확인하고 어디에 도움을 받을지 안내해요." />
        <SearchBox
          value={keyword}
          onChange={setKeyword}
          onSubmit={(trimmed) => trimmed && search(trimmed)}
          onClear={() => setKeyword('')}
        />
        <ul className="flex flex-wrap items-center gap-2">
          {SEARCH_EXAMPLES.map((example) => (
            <li key={example.label}>
              <button
                type="button"
                onClick={() => search(example.q)}
                className="min-h-9 rounded-full border border-line bg-surface px-3 text-sub text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {example.label}
              </button>
            </li>
          ))}
          {/* 전체 목록으로 바로 가는 길. 종류별 건수는 쓸모가 적어 보여 주지 않는다. */}
          <li className="ml-auto">
            <button
              type="button"
              onClick={() => onNavigate('disputeSearch')}
              className="flex min-h-9 items-center gap-0.5 px-1 text-label font-semibold text-accent hover:text-accent-strong"
            >
              사례·판례 전체 보기
              <ChevronRight size={16} />
            </button>
          </li>
        </ul>
      </header>

      <section className="flex flex-col gap-3">
        <SectionTitle>분쟁 유형별로 알아보기</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DISPUTE_TOPICS.map((topic) => (
            <li key={topic.key}>
              <TopicGuideCard
                topic={topic}
                questions={TOPIC_QUESTIONS[topic.key] ?? []}
                onOpenTopic={openTopic}
                onOpenFaq={(topicKey, faq) => onNavigate('disputeTopic', { topicKey, faq })}
              />
            </li>
          ))}
        </ul>
      </section>

      <IssueCard
        issue={WEEKLY_ISSUE}
        onSearch={() => onNavigate('disputeSearch', { q: WEEKLY_ISSUE.searchQuery, tab: 'PRECEDENT' })}
        onOpenTopic={() => openTopic(WEEKLY_ISSUE.topicKey)}
      />

      <section className="flex flex-col gap-3">
        <SectionTitle>어디에 도움을 요청해야 하나요?</SectionTitle>
        <ul className="grid gap-4 lg:grid-cols-3">
          {HELP_ROUTES.map((route) => (
            <li key={route.key}>
              <HelpRouteCard route={route} />
            </li>
          ))}
        </ul>
        <p className="text-sub text-ink-3">수수료·기간은 기관 안내 기준이에요. 신청 전에 기관에서 한 번 더 확인하세요.</p>
      </section>

      <LegalNotice />
    </div>
  );
};
