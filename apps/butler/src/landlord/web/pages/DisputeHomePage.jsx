import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { ContactLine } from '../components/DisputeReference/ContactLine';
import { LegalNotice } from '../components/DisputeReference/LegalNotice';
import { DisputeChip, QuestionChipRow } from '../components/DisputeReference/DisputeChips';
import { DisputeHeader } from '../components/DisputeReference/DisputeHeader';
import { SearchBox } from '../components/DisputeReference/SearchBox';
import { SourceFooter } from '../components/DisputeReference/SourceFooter';
import { TopicTile } from '../components/DisputeReference/TopicTile';
import { DISPUTE_TOPICS } from '../utils/disputeReference';
import { HELP_ROUTES, POPULAR_QUESTIONS } from '../utils/disputePortal';

// 앱은 카드 목록 위 묶음 이름이라 A팀 앱(하우스 로그 묶음·수리 상세 '처리 내용')과 같은 작은 회색 라벨. 화면 이름(상단 바)과 카드 제목이 가장 무겁게 보인다.
const SectionTitle = ({ isApp, children }) => (
  <h3 className={isApp ? 'text-m-label font-semibold text-ink-3' : 'text-section font-semibold text-ink'}>{children}</h3>
);

// 임대차 분쟁 센터 첫 화면은 '브리핑'이다. 고르기만 하고 긴 내용은 누르면 넘어가는 화면(상황 안내·자료 찾기)에 둔다.
// 검색 + 자주 묻는 질문 → 분쟁 유형(조정위원회 조정 대상 순서, 이름은 쉬운 말) → 도움받을 곳(연락처 포함) → 자료 출처.
// 첫 화면에는 AI 입구를 두지 않는다(찾다가 없을 때만 — DisputePage 참고). 레퍼런스: 정부24·찾기쉬운 생활법령정보 메인.
export const DisputeHomePage = () => {
  const { onNavigate, isApp } = useOutletContext();
  const [keyword, setKeyword] = useState('');

  const search = (q) => onNavigate('disputeSearch', { q });
  const openTopic = (topicKey) => onNavigate('disputeTopic', { topicKey });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <DisputeHeader title="임대차 분쟁 센터" description="분쟁이 생겼을 때 무엇부터 확인하고 어디에 도움을 받을지 안내해요." />
        <SearchBox
          value={keyword}
          onChange={setKeyword}
          onSubmit={(trimmed) => trimmed && search(trimmed)}
          onClear={() => setKeyword('')}
        />
        <QuestionChipRow
          isApp={isApp}
          after={
            // 전체 목록으로 바로 가는 길(웹은 칩 줄 오른쪽 끝, 앱은 라벨 줄 오른쪽 끝). 종류별 건수는 쓸모가 적어 보여 주지 않는다.
            <button
              type="button"
              onClick={() => onNavigate('disputeSearch')}
              className={`${isApp ? 'text-m-label' : 'ml-auto px-1 text-label'} flex min-h-9 items-center gap-0.5 font-semibold text-accent hover:text-accent-strong`}
            >
              사례·판례 전체 보기
              <ChevronRight size={16} />
            </button>
          }
        >
          {POPULAR_QUESTIONS.map((example) => (
            <li key={example.label}>
              <DisputeChip onClick={() => onNavigate('disputeTopic', { topicKey: example.topicKey, faq: example.faq })}>{example.label}</DisputeChip>
            </li>
          ))}
        </QuestionChipRow>
      </header>

      <section className="flex flex-col gap-3">
        <SectionTitle isApp={isApp}>분쟁 유형</SectionTitle>
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
        <SectionTitle isApp={isApp}>어디에 도움을 요청할까요?</SectionTitle>
        {/* PC(lg)는 기관마다 카드 3칸(언제 → 기관 → 아래 주 버튼), 좁은 화면은 한 줄씩 세로로 쌓고 버튼은 오른쪽에 둔다. */}
        <ul className="grid gap-3 lg:grid-cols-3">
          {HELP_ROUTES.map((route) => {
            const action = route.actions.find((item) => item.primary) ?? route.actions[0];
            return (
              <li
                key={route.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 lg:flex-col lg:flex-nowrap lg:items-stretch lg:p-5"
              >
                <span className="min-w-0 flex-1">
                  {/* 좁은 화면은 오른쪽 버튼 때문에 제목 칸이 좁아 마지막 한 단어만 넘어가므로 두 줄을 고르게(text-balance). */}
                  <span className="block break-keep text-balance text-body font-semibold text-ink lg:text-card">{route.when}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sub text-accent-strong">
                    → {route.name}
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-chip font-semibold">{route.badge}</span>
                    {route.region && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-chip font-semibold text-ink-2">{route.region}</span>}
                  </span>
                  {/* 연락처는 따로 모으지 않고 그 기관 카드 안에(Citizens Advice처럼 상황별 안내 아래 그 번호). */}
                  <ContactLine routeKey={route.key} className="mt-1" />
                </span>
                <a
                  href={action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-center gap-1 text-label font-semibold text-accent hover:text-accent-strong lg:rounded-btn lg:bg-accent lg:text-surface lg:hover:bg-accent-strong lg:hover:text-surface"
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
