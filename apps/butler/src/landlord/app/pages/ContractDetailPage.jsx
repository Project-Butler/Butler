import { useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { Badge, Button, MobileFormLayout } from '@butler/ui';
import { useGetContract } from '../../../shared/useGetContract';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetContractThread } from '../../web/hooks/useGetContractThread';
import { getContractDdayBadge, isContractInProgress } from '../../web/utils/contract';
import { TenantInviteCard } from '../components/TenantInviteCard/TenantInviteCard';
import { RenewalNoticeCard } from '../components/RenewalNoticeCard/RenewalNoticeCard';
import { RenewalNoticeSheet } from '../components/RenewalNoticeSheet/RenewalNoticeSheet';
import { getContractCardTitle, getContractTitle, isContractEnded, toContractRows } from '../utils/contractView';
import { useGoBack, useGoTo } from '../utils/navigation';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const LEGAL_NOTICE = '계약갱신청구권·차임 증액 한도(5%)는 참고 정보입니다 · 법률 자문 아님';

const PlaceholderCard = ({ title, children }) => (
  <section aria-label={title} className={`${CARD_CLASS} flex flex-col gap-1 p-4`}>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-m-card font-semibold text-ink">{title}</h2>
      <Badge mobile>준비 중</Badge>
    </div>
    <p className="text-m-sub text-ink-3">{children}</p>
  </section>
);

// 임대인 앱 계약 관리 (Figma M07). 하단 탭 대신 하단 고정 버튼 바를 쓴다.
// 갱신 진행 단계·첨부 문서는 저장할 모델·API가 없어 자리만 두고, [갱신 의사 묻기]는 비활성이다. 삭제 요소는 두지 않는다.
// 지금 계약의 임차인 대화는 부동산 상세 [기본 정보]에서 열고, 임차인 계정이 없으면 초대 카드(#169)를 보여 주며, 끝난 계약은 이미 있는 대화방만 여기서 연다.
// 끝난 계약(만료·해지)은 '지난 계약'으로 보여 주고 갱신 진행·[갱신 의사 묻기]·갱신 안내를 두지 않는다.
// 갱신 거절 통지 카드(#163)는 계약 응답의 renewalNotice 가 있을 때만(소유자·진행 중·시작 전 계약) 보이고, [통지 기록]이 기록 시트를 연다.
// [갱신 계약 등록]은 웹 호실 상세 계약 영역과 같은 조건(수정할 수 있는 진행 중 계약)에서만 보이고, 이전 계약 값을 채운 계약 등록 화면을 연다.
export const ContractDetailPage = ({ contractId, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('buildingList');
  const { data: contract, error, refetch } = useGetContract(contractId, { onUnauthorized });
  const [isNoticeSheetOpen, setIsNoticeSheetOpen] = useState(false);
  const isEnded = Boolean(contract && isContractEnded(contract));
  const { data: pastThread, error: pastThreadError } = useGetContractThread(isEnded ? contract.id : undefined, { onUnauthorized });

  if (!contract) {
    return (
      <MobileFormLayout shell="landlord-app-detail" topBar={{ title: '계약', onBack: goBack }}>
        {error ? (
          <NoticeBox>{error.message}</NoticeBox>
        ) : (
          <p role="status" className="py-10 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
      </MobileFormLayout>
    );
  }

  const dday = getContractDdayBadge(contract);
  const rows = toContractRows(contract);
  const canRenew = !contract.isReadOnly && isContractInProgress(contract.status);

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{ title: getContractTitle(contract), onBack: goBack }}
      overlay={
        isNoticeSheetOpen && (
          <RenewalNoticeSheet
            contractId={contract.id}
            readOnly={contract.isReadOnly}
            onChanged={refetch}
            onClose={() => setIsNoticeSheetOpen(false)}
            onUnauthorized={onUnauthorized}
          />
        )
      }
      cta={
        <>
          <Button
            variant="secondary"
            size="h52"
            className={isEnded ? 'flex-1' : undefined}
            disabled={contract.isReadOnly}
            onClick={() => goTo('contractEdit', { contractId: contract.id })}
          >
            계약 수정
          </Button>
          {!isEnded && (
            <Button size="h52" className="flex-1" disabled>
              갱신 의사 묻기 (준비 중)
            </Button>
          )}
        </>
      }
    >
      <section aria-label={getContractCardTitle(contract)} className={`${CARD_CLASS} flex flex-col px-4 pb-1 pt-4`}>
        <div className="flex items-center justify-between gap-2 pb-1">
          <h2 className="text-m-card font-semibold text-ink">{getContractCardTitle(contract)}</h2>
          {dday && (
            <Badge tone={dday.tone} className="rounded-chip font-num tabular-nums">
              {dday.label}
            </Badge>
          )}
        </div>
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
              <dt className="shrink-0 text-m-label text-ink-3">{row.label}</dt>
              <dd className={`min-w-0 text-right text-body text-ink ${row.numeric ? 'font-num tabular-nums' : ''}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {canRenew && (
        <Button variant="secondary" size="h48" onClick={() => goTo('contractRegister', { renewFrom: contract.id })}>
          <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
          갱신 계약 등록
        </Button>
      )}

      <TenantInviteCard contract={contract} onInvite={(id) => goTo('contractInvite', { contractId: id })} />

      {pastThread && (
        <Button variant="secondary" size="h48" onClick={() => goTo('thread', { threadId: pastThread.id })}>
          <MessageCircle size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
          {contract.tenant?.name ? `${contract.tenant.name}님과의 대화 보기` : '지난 대화 보기'}
        </Button>
      )}
      {pastThreadError && <NoticeBox>{pastThreadError.message}</NoticeBox>}

      {!isEnded && contract.renewalNotice && (
        <RenewalNoticeCard summary={contract.renewalNotice} onOpenRecords={() => setIsNoticeSheetOpen(true)} />
      )}

      {!isEnded && (
        <PlaceholderCard title="갱신 진행">갱신 의사 확인 · 조건 협의 · 재계약서 서명 단계를 곧 이곳에서 진행할 수 있어요.</PlaceholderCard>
      )}
      <PlaceholderCard title="첨부 문서">계약서 등 계약 문서는 문서함이 열리면 이곳에서 볼 수 있어요.</PlaceholderCard>

      {!isEnded && <p className="text-m-sub text-ink-3">{LEGAL_NOTICE}</p>}
    </MobileFormLayout>
  );
};
