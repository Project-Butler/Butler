import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { SearchBox } from '../components/DisputeReference/SearchBox';
import { SourceFooter } from '../components/DisputeReference/SourceFooter';
import { TopicTile } from '../components/DisputeReference/TopicTile';
import { DISPUTE_TOPICS } from '../utils/disputeReference';
import { HELP_ROUTES, SEARCH_EXAMPLES } from '../utils/disputePortal';

const SectionTitle = ({ children }) => <h3 className="text-section font-semibold text-ink">{children}</h3>;

// 임대차 분쟁 센터 첫 화면은 '브리핑'이다. 고르기만 하고 긴 내용은 누르면 넘어가는 화면(상황 안내·자료 찾기)에 둔다.
// 검색 + 많이 찾는 질문 → 분쟁 유형(조정위원회 조정 대상 순서, 이름은 쉬운 말) → 도움받을 곳 요약 → 자료 출처·기관 연락처.
// 첫 화면에는 AI 입구를 두지 않는다(찾다가 없을 때만 — DisputePage 참고). 레퍼런스: 정부24·찾기쉬운 생활법령정보 메인.
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sub font-semibold text-ink-3">많이 찾는 질문</span>
          <ul className="contents">
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
          </ul>
          {/* 전체 목록으로 바로 가는 길. 종류별 건수는 쓸모가 적어 보여 주지 않는다. */}
          <button
            type="button"
            onClick={() => onNavigate('disputeSearch')}
            className="ml-auto flex min-h-9 items-center gap-0.5 px-1 text-label font-semibold text-accent hover:text-accent-strong"
          >
            사례·판례 전체 보기
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <SectionTitle>분쟁 유형</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DISPUTE_TOPICS.map((topic) => (
            <li key={topic.key}>
              <TopicTile topic={topic} onClick={() => openTopic(topic.key)} />
            </li>
          ))}
        </ul>
      </section>

      {/* 기관 상세(대상·비용·기간)는 상황 안내의 '분쟁조정'·'법원' 단계에 있고, 여기서는 언제 어디로 가는지만 보여 준다. */}
      <section className="flex flex-col gap-3">
        <SectionTitle>어디에 도움을 요청할까요?</SectionTitle>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {HELP_ROUTES.map((route) => {
            const action = route.actions.find((item) => item.primary) ?? route.actions[0];
            return (
              <li key={route.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 lg:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block break-keep text-body font-semibold text-ink">{route.when}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sub text-accent-strong">
                    → {route.name}
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-chip font-semibold">{route.badge}</span>
                  </span>
                </span>
                <a
                  href={action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-1 text-label font-semibold text-accent hover:text-accent-strong"
                >
                  {action.label}
                  <ExternalLink size={14} />
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <SourceFooter />

      <LegalNotice />
    </div>
  );
};
