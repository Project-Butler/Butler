import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../PageHeader/PageHeader';
import { BuildingSwitcher } from '../CommunityBuildingSwitcher/BuildingSwitcher';
import { PreviewNotice } from './PreviewNotice';
import { SectionTabs } from './SectionTabs';
import { VerificationBadge } from './VerificationBadge';

// 커뮤니티 PC 페이지 틀. LandlordLayout 안의 보통 PC 페이지라
// 상단 바·알림 종·브레드크럼은 A팀 틀이 하고, 여기는 PageHeader(건물명 · 지역 · 인증 배지 · 건물 바꾸기) + 탭 줄만 그린다.
//
// frame: CommunityPage 가 만든 { building, buildings, onSelectBuilding, preview, verify }
//   preview.reason: 이 동네 미리보기 상태(utils/communityPreview.js) · verify: 권리자 인증 화면으로(갈 호실을 모르면 없음)
// section: 선택된 탭 · scopeText: 탭 아래 범위 안내 한 줄(목록 화면만)
// blockedReason: 응답이 알려 준 보는 사람 자격(writeBlockedReason). 응답 전이면 미리보기 상태로 대신한다.
// 미리보기 중(자격 없음)이면 배지가 '인증 전' · '인증 만료' 이고, 탭 줄 아래에 인증 안내 한 줄(PreviewNotice)을 둔다.
// onBack 이 있으면 하위 화면 — 탭 줄 아래 "← 목록으로". narrow 면 내용을 max-w-3xl 로 좁힌다
// (글 상세 · 글쓰기 · 투표 만들기 — 읽는 화면. 투표 상세는 두 칸이라 넓게).
// 내용 조각(글 카드 · 투표 카드 · 차트 …)은 이 틀과 떼어 둔다 — 모바일 화면을 다시 붙일 때 그대로 쓴다.
export const CommunityFrame = ({ frame, section, scopeText, blockedReason = null, onBack, narrow = false, children }) => {
  const navigate = useNavigate();
  const { building, buildings, onSelectBuilding, preview, verify } = frame;
  const reason = blockedReason ?? preview?.reason ?? null;

  // 건물을 바꾸면 같은 탭에 머문다. 하위 화면(다른 법정동의 글·투표)이었으면 그 탭 목록으로 간다.
  const selectBuilding = (complexId) => {
    onSelectBuilding(complexId);
    if (onBack) navigate(`/community/${section}`);
  };

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <div className="space-y-4">
        <PageHeader
          title={building.name}
          description={building.regionName}
          actions={
            <>
              <VerificationBadge blockedReason={reason} />
              {buildings.length > 1 && (
                <BuildingSwitcher buildings={buildings} activeComplexId={building.complexId} onChange={selectBuilding} />
              )}
            </>
          }
        />
        <SectionTabs activeSection={section} />
      </div>

      {reason && <PreviewNotice onVerify={verify} />}

      {onBack ? (
        <div className={`space-y-6 ${narrow ? 'max-w-3xl' : ''}`}>
          <button
            type="button"
            onClick={onBack}
            className="-mt-2 inline-flex items-center gap-1.5 text-label font-semibold text-ink-2 hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            목록으로
          </button>
          {children}
        </div>
      ) : (
        <>
          {scopeText && <p className="-mt-2 text-body text-ink-2">{scopeText}</p>}
          {children}
        </>
      )}
    </div>
  );
};
