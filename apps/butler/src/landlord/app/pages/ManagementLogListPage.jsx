import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button, FilterChip } from '@butler/ui';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetManagementLogList } from '../../web/hooks/useGetManagementLogList';
import { useGetPropertyList } from '../../web/hooks/useGetPropertyList';
import { formatAttachmentCount } from '../../web/utils/attachment';
import { TYPE_FILTER_OPTIONS } from '../../web/utils/managementLog';
import { formatUnitLabel } from '../../web/utils/unitAddress';
import { AppTabShell } from '../components/AppTabShell/AppTabShell';
import { formatLogDay, getLogSourceLabel, groupLogsByMonth } from '../utils/logGroups';
import { useGoBack, useGoTo } from '../utils/navigation';

const PAGE_SIZE = 20;
// 호실 필터는 지금 소유한 호실과 소유가 끝난 호실 전부(목록 API 최대 크기, 웹과 같음)
const PROPERTY_PICKER_SIZE = 100;
const CARD_CLASS = 'rounded-card border border-line bg-surface';
const IMMUTABLE_NOTICE = '관리 로그는 수정·삭제할 수 없습니다. 바뀐 내용은 새 기록으로 쌓이고 감사 로그에 남습니다.';

// 기록 한 줄: 날짜 · **호실** 제목 · 첨부 · 연결 대상(파란 글자). 누르면 기록 상세.
const LogRow = ({ log, onOpen }) => {
  const attachment = formatAttachmentCount(log.attachments);
  const source = getLogSourceLabel(log);
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 py-3 text-left">
        <span className="w-11 shrink-0 pt-px font-num text-num-sub tabular-nums text-ink-3">{formatLogDay(log.occurredOn)}</span>
        <span className="min-w-0 flex-1 text-body text-ink">
          <strong className="font-semibold">{formatUnitLabel(log.property.buildingNo, log.property.unitNo)}</strong> {log.title}
          {attachment && <span className="text-ink-3"> · {attachment}</span>}
          {source && <span className="text-seal"> · {source}</span>}
        </span>
      </button>
    </li>
  );
};

// 한 필터 조합의 목록. 필터가 바뀌면 key 로 새로 시작해 page 가 1로 돌아간다.
const LogListSection = ({ propertyId, type, onOpen, onUnauthorized }) => {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, refetch } = useGetManagementLogList({ propertyId, type, page, size: PAGE_SIZE }, { onUnauthorized });

  if (error && !data) return <NoticeBox>{error.message}</NoticeBox>;
  if (!data) {
    return (
      <p role="status" className="py-10 text-center text-body text-ink-3">
        불러오는 중입니다
      </p>
    );
  }
  if (data.items.length === 0) {
    return (
      <p className="py-10 text-center text-body text-ink-3">
        {propertyId || type ? '조건에 맞는 기록이 없어요' : '아직 관리 로그가 없어요'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groupLogsByMonth(data.items).map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-2">
          <h2 className="text-m-label font-semibold text-ink-3">{group.label}</h2>
          <ul className={`${CARD_CLASS} px-4`}>
            {group.items.map((log) => (
              <LogRow key={log.id} log={log} onOpen={() => onOpen(log.id)} />
            ))}
          </ul>
        </section>
      ))}
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {data.meta.hasNext && (
        // 다음 페이지 로드가 실패했으면 page 는 이미 N이므로 N+1로 건너뛰지 않고 같은 페이지를 다시 불러온다.
        <Button variant="secondary" size="h44" disabled={isLoading} onClick={() => (error ? refetch() : setPage((prev) => prev + 1))}>
          {isLoading ? '불러오는 중' : error ? '다시 시도' : '더 보기'}
        </Button>
      )}
    </div>
  );
};

// 호실 고르기(상단 바 필터 아이콘). 고르면 주소(?propertyId=)를 바꾸고 닫는다.
const PropertyPicker = ({ properties, propertyId, onSelect, onClose }) => (
  <div role="dialog" aria-modal="true" aria-label="호실 선택" className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" onClick={onClose}>
    <div className="max-h-[70vh] w-full max-w-[430px] overflow-y-auto rounded-t-card bg-surface px-5 pb-7 pt-4" onClick={(event) => event.stopPropagation()}>
      <h2 className="pb-2 text-m-card font-semibold text-ink">호실 선택</h2>
      <ul>
        {[{ id: '', displayName: '전체 호실' }, ...properties].map((property) => {
          const selected = (propertyId ?? '') === property.id;
          return (
            <li key={property.id || 'all'}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(property.id || undefined)}
                className={`block w-full border-b border-line py-3 text-left text-body last:border-b-0 ${selected ? 'font-semibold text-accent-strong' : 'text-ink'}`}
              >
                {property.displayName}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  </div>
);

// 임대인 앱 관리 로그 House Log (Figma M08). 웹 관리 로그와 같은 API·같은 유형 칩이고, 월별로 묶어 보여 준다.
// 관리 로그는 고치거나 지우지 않는 원칙이라 목록에 수정·삭제 동작이 없다. 기록 추가 진입점은 피그마에 없어 두지 않는다.
export const ManagementLogListPage = ({ propertyId, onUnauthorized }) => {
  const goTo = useGoTo();
  const goBack = useGoBack('buildingList');
  const [type, setType] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const hookOptions = { onUnauthorized };
  const owned = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const formerlyOwned = useGetPropertyList({ relation: 'FORMER_OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  // 팔았다가 다시 소유한 호실이 두 번 나오지 않게 id 로 합친다.
  const properties = [
    ...new Map([...(owned.data?.items ?? []), ...(formerlyOwned.data?.items ?? [])].map((item) => [item.id, item])).values(),
  ];
  const selectedProperty = properties.find((property) => property.id === propertyId);

  const filterButton = (
    <button
      type="button"
      aria-label="호실 선택"
      onClick={() => setIsPickerOpen(true)}
      className={`flex h-11 w-11 items-center justify-center ${propertyId ? 'text-accent' : 'text-ink-2'}`}
    >
      <SlidersHorizontal size={20} aria-hidden="true" />
    </button>
  );

  return (
    <AppTabShell backBar={{ title: '관리 로그', onBack: goBack, action: filterButton }}>
      <div className="flex flex-col gap-3.5">
        {propertyId && (
          <p className="text-m-sub text-ink-2">
            <span className="font-semibold text-ink">{selectedProperty?.displayName ?? '선택한 호실'}</span> 기록만 보고 있어요
          </p>
        )}

        <div role="group" aria-label="유형" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ value: null, label: '전체' }, ...TYPE_FILTER_OPTIONS].map((option) => (
            <span key={option.value ?? 'all'} className="shrink-0">
              <FilterChip selected={option.value === type} onClick={() => setType(option.value)}>
                {option.label}
              </FilterChip>
            </span>
          ))}
        </div>

        <p className="rounded-input bg-surface-2 px-4 py-3 text-m-sub text-ink-2">{IMMUTABLE_NOTICE}</p>

        <LogListSection
          key={`${propertyId}-${type}`}
          propertyId={propertyId}
          type={type ?? undefined}
          onOpen={(logId) => goTo('logDetail', { logId })}
          onUnauthorized={onUnauthorized}
        />
      </div>

      {isPickerOpen && (
        <PropertyPicker
          properties={properties}
          propertyId={propertyId}
          onClose={() => setIsPickerOpen(false)}
          onSelect={(id) => {
            setIsPickerOpen(false);
            goTo('logs', { propertyId: id }, { replace: true });
          }}
        />
      )}
    </AppTabShell>
  );
};
