import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetComplex } from '../../web/hooks/useGetComplex';
import { useGetContractList } from '../../web/hooks/useGetContractList';
import { useGetLatestOwnershipVerification } from '../../web/hooks/useGetLatestOwnershipVerification';
import { useGetManagementLogList } from '../../web/hooks/useGetManagementLogList';
import { useGetProperty } from '../../web/hooks/useGetProperty';
import { COMMUNITY_PATH } from '../../web/routes';
import { formatContractAmount, formatPeriod, getContractDdayBadge, getContractStatusBadge } from '../../web/utils/contract';
import { formatDateKST } from '../../web/utils/format';
import { getLogTypeLabel } from '../../web/utils/managementLog';
import { formatUnitLabel } from '../../web/utils/unitAddress';
import { getPropertyStatusBadge } from '../../web/utils/unitListing';
import { getVerificationBadge } from '../../web/utils/verificationBadge';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { MoreMenu } from '../components/MoreMenu/MoreMenu';
import { UnderlineTabs } from '../components/UnderlineTabs/UnderlineTabs';
import { formatLogDay } from '../utils/logGroups';
import { useGoBack, useGoTo } from '../utils/navigation';
import { formatPropertySpec, getMoreMenuTargets, toSummaryStats } from '../utils/propertyView';

const CARD_CLASS = 'rounded-card border border-line bg-surface';
const CONTRACT_LIST_SIZE = 20;
const LOG_PREVIEW_SIZE = 5;

const TAB_OPTIONS = [
  { value: 'info', label: '기본 정보' },
  { value: 'contracts', label: '계약' },
  { value: 'logs', label: '관리 로그' },
  { value: 'documents', label: '문서' },
];

const Loading = () => (
  <p role="status" className="py-6 text-center text-body text-ink-3">
    불러오는 중입니다
  </p>
);

const EmptyText = ({ children }) => <p className="py-6 text-center text-body text-ink-3">{children}</p>;

const Stat = ({ label, value, tone }) => (
  <div className="flex min-w-0 flex-1 flex-col gap-1">
    <span className="text-m-sub text-ink-3">{label}</span>
    <span className={`font-num text-num-lg font-bold tabular-nums ${tone === 'danger' ? 'text-crit-ink' : 'text-ink'}`}>{value}</span>
  </div>
);

const InfoRow = ({ label, value, numeric = false }) => (
  <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
    <dt className="shrink-0 text-m-label text-ink-3">{label}</dt>
    <dd className={`min-w-0 text-right text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{value ?? '—'}</dd>
  </div>
);

const SummaryStats = ({ contract }) => {
  const stats = toSummaryStats(contract);
  return (
    <div className="flex gap-3 border-t border-line pt-3">
      <Stat label="보증금" value={stats.deposit} />
      <Stat label="월세" value={stats.rent} />
      <Stat label="계약 만기" value={stats.dday.label} tone={stats.dday.tone} />
    </div>
  );
};

// 지금 소유 중일 때만 그린다. 계약 목록 훅은 조건 없이 부르므로 소유 관계가 없으면 이 컴포넌트를 쓰지 않는다.
const CurrentContractStats = ({ ownershipId, onUnauthorized }) => {
  const current = useGetContractList(
    { ownershipId, status: 'ACTIVE,EXPIRING_SOON,UPCOMING', sort: 'endDate:asc', size: 1 },
    { onUnauthorized },
  );
  return (
    <>
      {current.error && <NoticeBox>{current.error.message}</NoticeBox>}
      <SummaryStats contract={current.data?.items[0] ?? null} />
    </>
  );
};

// [기본 정보] 등기 고유번호는 응답에 없어 두지 않는다. 등기부 대조 카드는 인증 완료일 때 인증 응답의 날짜만 쓴다.
const InfoTab = ({ property, complex, attempt, onCommunity }) => {
  const isVerified = property.myRelation?.verificationStatus === 'VERIFIED';
  const verifiedOn = attempt?.status === 'VERIFIED' ? formatDateKST(attempt.finishedAt) : null;
  return (
    <div className="flex flex-col gap-3">
      <dl className={`${CARD_CLASS} px-4`}>
        <InfoRow label="주소" value={complex?.roadAddress ?? complex?.jibunAddress ?? property.complex.roadAddress} />
        <InfoRow label="법정동" value={complex?.region?.fullName} />
        <InfoRow label="동·호" value={formatUnitLabel(property.buildingNo, property.unitNo)} />
        <InfoRow label="전용면적" value={property.exclusiveArea != null ? `${property.exclusiveArea}m²` : null} numeric />
        <InfoRow label="등록일" value={formatDateKST(property.createdAt)} numeric />
      </dl>
      {isVerified && verifiedOn && (
        <section aria-label="등기부 대조 완료" className="rounded-card border border-seal bg-seal-box px-4 py-3.5">
          <h3 className="text-m-label font-semibold text-seal-ink">등기부 대조 완료</h3>
          <p className="mt-1 font-num text-num-sub tabular-nums text-seal-ink">인증 완료 · {verifiedOn}</p>
        </section>
      )}
      <button
        type="button"
        onClick={onCommunity}
        className="flex items-center justify-between gap-3 rounded-card border border-dashed border-line bg-surface-2 px-4 py-3.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-m-sub text-ink-3">2팀 피처 자리 · 커뮤니티</span>
          <span className="text-body font-medium text-ink-2">{property.complex.name} 단지 커뮤니티 · 실거래가 바로가기</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
      </button>
    </div>
  );
};

// [계약] 이 소유 관계의 계약 전부(끝난 것 포함), 종료일 늦은 것부터.
const ContractsTab = ({ ownershipId, onOpen, onUnauthorized }) => {
  const list = useGetContractList(
    { ownershipId, includeEndedOwnership: 'true', sort: 'endDate:desc', size: CONTRACT_LIST_SIZE },
    { onUnauthorized },
  );
  if (list.error && !list.data) return <NoticeBox>{list.error.message}</NoticeBox>;
  if (!list.data) return <Loading />;
  if (list.data.items.length === 0) return <EmptyText>등록한 계약이 없어요</EmptyText>;
  return (
    <ul aria-label="계약 목록" className={`${CARD_CLASS} px-4`}>
      {list.data.items.map((contract) => {
        const status = getContractStatusBadge(contract);
        const dday = getContractDdayBadge(contract);
        return (
          <li key={contract.id} className="border-b border-line last:border-b-0">
            <button type="button" onClick={() => onOpen(contract.id)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-body font-semibold text-ink">{contract.tenantName}</span>
                  <Badge mobile tone={status.tone}>{status.label}</Badge>
                  {dday && (
                    <Badge tone={dday.tone} className="rounded-chip font-num tabular-nums">
                      {dday.label}
                    </Badge>
                  )}
                </span>
                <span className="font-num text-num-sub tabular-nums text-ink-3">
                  {formatPeriod(contract)} · {formatContractAmount(contract)}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// [관리 로그] 최근 기록 몇 건 + 전체 보기(호실 필터).
const LogsTab = ({ propertyId, onOpen, onAll, onUnauthorized }) => {
  const list = useGetManagementLogList({ propertyId, size: LOG_PREVIEW_SIZE }, { onUnauthorized });
  if (list.error && !list.data) return <NoticeBox>{list.error.message}</NoticeBox>;
  if (!list.data) return <Loading />;
  const logs = list.data.items;
  return (
    <div className="flex flex-col gap-3">
      {logs.length === 0 ? (
        <EmptyText>아직 관리 로그가 없어요</EmptyText>
      ) : (
        <ul aria-label="최근 관리 로그" className={`${CARD_CLASS} px-4`}>
          {logs.map((log) => (
            <li key={log.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => onOpen(log.id)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="w-11 shrink-0 font-num text-num-sub tabular-nums text-ink-3">{formatLogDay(log.occurredOn)}</span>
                <span className="min-w-0 flex-1 truncate text-body text-ink">{log.title}</span>
                <Badge mobile>{getLogTypeLabel(log.type)}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="h44" onClick={onAll}>
        전체 보기
      </Button>
    </div>
  );
};

// [문서] 문서 API가 아직 관리 로그 첨부만 다뤄 호실 문서는 자리만 둔다.
const DocumentsTab = () => (
  <section aria-label="문서 준비 중" className={`${CARD_CLASS} px-4 py-8 text-center`}>
    <p className="text-m-card font-semibold text-ink">준비 중</p>
    <p className="mt-1 text-body text-ink-2">호실 문서함은 곧 열려요.</p>
  </section>
);

// 임대인 앱 부동산 상세 (Figma M06). 웹 호실 상세와 같은 API를 쓰고, 수정·소유 종료처럼 폼이 필요한 동작은 웹 상세에서 한다.
export const PropertyDetailPage = ({ propertyId, onUnauthorized }) => {
  const navigate = useNavigate();
  const goTo = useGoTo();
  const goBack = useGoBack('buildingList');
  const [tab, setTab] = useState('info');

  const hookOptions = { onUnauthorized };
  const propertyQuery = useGetProperty(propertyId, hookOptions);
  const property = propertyQuery.data;
  const complexQuery = useGetComplex(property?.complex.id, hookOptions);
  const ownershipId = property?.myRelation?.ownershipId;
  const activeOwnershipId = property?.myRelation?.type === 'OWNER' ? ownershipId : undefined;
  const latestAttempt = useGetLatestOwnershipVerification(activeOwnershipId, hookOptions);

  if (!property) {
    return (
      <AppTabShell backBar={{ title: '부동산 상세', onBack: goBack }}>
        {propertyQuery.error ? <NoticeBox>{propertyQuery.error.message}</NoticeBox> : <Loading />}
      </AppTabShell>
    );
  }

  const verification = getVerificationBadge(property.myRelation?.verificationStatus);
  const status = getPropertyStatusBadge(property.status);
  const spec = formatPropertySpec(property, complexQuery.data);
  const menuItems = getMoreMenuTargets(property).map(({ key, label, target }) => ({
    key,
    label,
    onSelect: () => goTo(target.key, target.params),
  }));

  return (
    <AppTabShell backBar={{ title: property.displayName, onBack: goBack, action: <MoreMenu items={menuItems} /> }}>
      <div className="flex flex-col gap-3.5">
        {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}

        <section aria-label="요약" className={`${CARD_CLASS} flex flex-col gap-3 p-4`}>
          <div className="flex flex-wrap gap-1.5">
            {property.myRelation?.type === 'OWNER' && (
              <Badge mobile tone={verification.tone}>
                {verification.tone === 'verified' ? `✓ ${verification.label}` : verification.label}
              </Badge>
            )}
            <Badge mobile tone={status.tone}>
              {status.label}
            </Badge>
          </div>
          {spec && <p className="text-m-sub text-ink-3">{spec}</p>}
          {activeOwnershipId ? (
            <CurrentContractStats ownershipId={activeOwnershipId} onUnauthorized={onUnauthorized} />
          ) : (
            <SummaryStats contract={null} />
          )}
        </section>

        <UnderlineTabs ariaLabel="부동산 정보" idPrefix="property" options={TAB_OPTIONS} value={tab} onChange={setTab} />

        <div id="property-panel" role="tabpanel" aria-labelledby={`property-tab-${tab}`}>
          {tab === 'info' && (
            <InfoTab
              property={property}
              complex={complexQuery.data}
              attempt={latestAttempt.data}
              onCommunity={() => navigate(COMMUNITY_PATH)}
            />
          )}
          {tab === 'contracts' &&
            (ownershipId ? (
              <ContractsTab
                ownershipId={ownershipId}
                onOpen={(contractId) => goTo('contractDetail', { contractId })}
                onUnauthorized={onUnauthorized}
              />
            ) : (
              <EmptyText>등록한 계약이 없어요</EmptyText>
            ))}
          {tab === 'logs' && (
            <LogsTab
              propertyId={property.id}
              onOpen={(logId) => goTo('logDetail', { logId })}
              onAll={() => goTo('logs', { propertyId: property.id })}
              onUnauthorized={onUnauthorized}
            />
          )}
          {tab === 'documents' && <DocumentsTab />}
        </div>
      </div>
    </AppTabShell>
  );
};
