import { Badge, Button, MobileFormLayout } from '@butler/ui';
import { useGetContract } from '../../../shared/useGetContract';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { getContractDdayBadge } from '../../web/utils/contract';
import { getContractTitle, toContractRows } from '../utils/contractView';
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
export const ContractDetailPage = ({ contractId, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('buildingList');
  const { data: contract, error } = useGetContract(contractId, { onUnauthorized });

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

  return (
    <MobileFormLayout
      shell="landlord-app-detail"
      topBar={{ title: getContractTitle(contract), onBack: goBack }}
      cta={
        <>
          <Button
            variant="secondary"
            size="h52"
            disabled={contract.isReadOnly}
            onClick={() => goTo('contractEdit', { contractId: contract.id })}
          >
            계약 수정
          </Button>
          <Button size="h52" className="flex-1" disabled>
            갱신 의사 묻기 (준비 중)
          </Button>
        </>
      }
    >
      <section aria-label="현재 계약" className={`${CARD_CLASS} flex flex-col px-4 pb-1 pt-4`}>
        <div className="flex items-center justify-between gap-2 pb-1">
          <h2 className="text-m-card font-semibold text-ink">현재 계약</h2>
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

      <PlaceholderCard title="갱신 진행">갱신 의사 확인 · 조건 협의 · 재계약서 서명 단계를 곧 이곳에서 진행할 수 있어요.</PlaceholderCard>
      <PlaceholderCard title="첨부 문서">계약서 등 계약 문서는 문서함이 열리면 이곳에서 볼 수 있어요.</PlaceholderCard>

      <p className="text-m-sub text-ink-3">{LEGAL_NOTICE}</p>
    </MobileFormLayout>
  );
};
