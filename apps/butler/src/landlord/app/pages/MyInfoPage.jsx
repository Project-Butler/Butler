import { Settings } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useGetPropertyOwnershipList } from '../../web/hooks/useGetPropertyOwnershipList';
import { getInitial, toPermissionRows, toVerificationRows } from '../utils/myInfoView';
import { useGoTo } from '../utils/navigation';

// 홈·내 자산과 같은 크기(목록 API 최대 100건)로 한 번에 받는다.
const LIST_SIZE = 100;
const CARD_CLASS = 'rounded-card border border-line bg-surface';
const SECTION_TITLE = 'text-m-card font-semibold text-ink';

const ProfileCard = ({ user }) => (
  <section aria-label="계정" className={`${CARD_CLASS} flex items-center gap-4 p-4`}>
    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-h2 font-semibold text-accent-strong">
      {getInitial(user.name)}
    </span>
    <div className="min-w-0">
      <p className="flex items-center gap-2">
        <span className="truncate text-m-card font-semibold text-ink">{user.name}</span>
        <Badge mobile className="shrink-0">
          임대인
        </Badge>
      </p>
      <p className="mt-0.5 truncate text-m-sub text-ink-3">{user.email}</p>
    </div>
  </section>
);

const VerificationRow = ({ row, onVerify }) => (
  <li className="flex items-center justify-between gap-3 border-b border-line py-3.5 last:border-b-0">
    <span className="min-w-0">
      <span className="block truncate text-body font-semibold text-ink">{row.title}</span>
      <span className="mt-0.5 block text-m-sub text-ink-3">{row.description}</span>
    </span>
    {row.verifyLabel ? (
      <Button type="button" variant="verifyOutline" size="h44" className="shrink-0" onClick={onVerify}>
        {row.verifyLabel}
      </Button>
    ) : (
      <Badge mobile tone={row.badge.tone} className="shrink-0">
        {row.badge.tone === 'verified' ? `✓ ${row.badge.label}` : row.badge.label}
      </Badge>
    )}
  </li>
);

const VerificationSection = ({ ownerships, onVerify, onRegister }) => {
  const rows = ownerships.data ? toVerificationRows(ownerships.data.items) : [];
  return (
    <section aria-label="권리자 인증" className={`${CARD_CLASS} flex flex-col px-4 pt-4`}>
      <h2 className={`${SECTION_TITLE} pb-1`}>권리자 인증</h2>
      {ownerships.error && <NoticeBox className="mb-4">{ownerships.error.message}</NoticeBox>}
      {!ownerships.error && ownerships.isLoading && (
        <p role="status" className="py-6 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}
      {ownerships.data && rows.length === 0 && (
        <div className="flex flex-col gap-3 pb-4 pt-2">
          <p className="text-body text-ink-3">등록한 부동산이 없어요.</p>
          <Button type="button" variant="secondary" size="h44" onClick={onRegister}>
            부동산 등록하기
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <ul>
          {rows.map((row) => (
            <VerificationRow key={row.id} row={row} onVerify={() => onVerify(row.propertyId)} />
          ))}
        </ul>
      )}
    </section>
  );
};

const PermissionSection = ({ verifiedLegalDongCodes }) => (
  <section aria-label="내 권한" className={`${CARD_CLASS} flex flex-col px-4 pt-4`}>
    <h2 className={`${SECTION_TITLE} pb-1`}>내 권한</h2>
    <dl>
      {toPermissionRows(verifiedLegalDongCodes).map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 border-b border-line py-3.5 last:border-b-0">
          <dt className="text-m-sub text-ink-3">{row.label}</dt>
          <dd className="text-body font-semibold text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  </section>
);

// 임대인 앱 내 정보(하단 탭 '내 정보'). 계정 · 권리자 인증(활성 소유 호실별) · 내 권한 · 로그아웃.
// 톱니(알림 설정)는 일정·알림 화면의 알림 받기 카드로 간다. 인증하기는 그 호실의 권리자 인증 화면으로 간다.
export const MyInfoPage = ({ user, verifiedLegalDongCodes, onLogout, onUnauthorized }) => {
  const goTo = useGoTo();
  const ownerships = useGetPropertyOwnershipList({ active: 'true', size: LIST_SIZE }, { onUnauthorized });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-sm font-bold text-ink">내 정보</h1>
        <button
          type="button"
          aria-label="알림 설정"
          onClick={() => goTo('schedules')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        >
          <Settings size={22} aria-hidden="true" />
        </button>
      </div>
      <ProfileCard user={user} />
      <VerificationSection
        ownerships={ownerships}
        onVerify={(propertyId) => goTo('propertyVerify', { propertyId })}
        onRegister={() => goTo('propertyRegister')}
      />
      <PermissionSection verifiedLegalDongCodes={verifiedLegalDongCodes} />
      <Button type="button" variant="secondary" size="h48" className="w-full" onClick={onLogout}>
        로그아웃
      </Button>
    </div>
  );
};
