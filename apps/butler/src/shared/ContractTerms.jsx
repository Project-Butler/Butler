import { formatManwon, formatPeriod, formatRentDay, getLeaseTypeLabel } from './contractFormat';

const Row = ({ label, children, first = false, numeric = true }) => (
  <div className={`flex items-center justify-between gap-3 py-2.5 text-body ${first ? '' : 'border-t border-line'}`}>
    <dt className="shrink-0 text-ink-3">{label}</dt>
    <dd className={`text-right font-semibold text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{children}</dd>
  </div>
);

// 계약 조건 카드(시안 B3 · E2): 호실 + 유형 칩, 보증금 · 월세(입금일) · 기간 · 임대인. 전세는 월세 줄이 없다.
export const ContractTerms = ({ contract, showLandlord = true }) => {
  const isMonthly = contract.leaseType === 'MONTHLY';
  const rentDay = formatRentDay(contract.rentPaymentDay);
  return (
    <section aria-label="계약 조건" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-m-card font-semibold text-ink">{contract.propertyDisplayName}</p>
        <span className="shrink-0 rounded-chip bg-surface-2 px-2 py-0.5 text-chip font-semibold text-ink-2">{getLeaseTypeLabel(contract.leaseType)}</span>
      </div>
      <dl className="mt-2 border-t border-line">
        <Row label="보증금" first>
          {formatManwon(contract.deposit)}
        </Row>
        {isMonthly && (
          <Row label="월세">
            {formatManwon(contract.monthlyRent)}
            {rentDay && ` · ${rentDay}`}
          </Row>
        )}
        <Row label="기간">{formatPeriod(contract.startDate, contract.endDate)}</Row>
        {showLandlord && contract.landlordName && (
          <Row label="임대인" numeric={false}>
            {contract.landlordName}
          </Row>
        )}
      </dl>
    </section>
  );
};
