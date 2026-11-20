import { useOutletContext } from 'react-router-dom';
import { BookOpen, ExternalLink, FileText, MessageSquare, Scale } from 'lucide-react';
import { DATA_SOURCES } from '../../utils/disputePortal';

const SOURCE_ICONS = { 조정사례: FileText, 상담사례: MessageSquare, '판례·법령': Scale, 가이드: BookOpen };

// 맨 아래 자료 출처(확인용이라 가볍게). 테두리 없는 아이콘 + 자료 이름 글자 링크 한 줄(알약은 위 질문 칩과 헷갈려 뺌), 긴 설명은 마우스를 올리면 보인다.
// 링크는 기관 메인이 아니라 해당 자료 페이지로. 연락처는 여기 두지 않고 기관 카드 안(ContactLine)에만 둔다.
// 웹은 라벨과 링크를 한 줄에 감고, 앱은 '자주 묻는 질문'처럼 라벨을 위에 따로 둔다(라벨이 첫 링크에 붙어 링크 이름처럼 읽히지 않게).
// 레퍼런스 비교는 doc/근거조사 11-12 절.
export const SourceFooter = () => {
  const { isApp } = useOutletContext();
  return (
    <footer className="flex flex-col gap-3 border-t border-line pt-4">
      <section aria-label="자료 출처" className={isApp ? 'flex flex-col gap-1' : 'flex flex-wrap items-center gap-x-4 gap-y-1'}>
        <h3 className={`${isApp ? 'text-m-label' : 'text-sub'} font-semibold text-ink-3`}>자료 출처</h3>
        <ul className={isApp ? 'flex flex-wrap gap-x-4' : 'contents'}>
          {DATA_SOURCES.map((source) => {
            const Icon = SOURCE_ICONS[source.label] ?? FileText;
            return (
              <li key={source.detail}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  title={source.detail}
                  className="inline-flex min-h-9 items-center gap-1 text-sub text-ink-2 underline-offset-2 transition-colors hover:text-accent hover:underline"
                >
                  <Icon size={14} className="shrink-0 text-accent" />
                  {source.title}
                  <ExternalLink size={12} className="shrink-0 text-ink-3" />
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </footer>
  );
};
