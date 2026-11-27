import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axisTicks, formatTick, hasMissingMonths, MissingLegend, PriceChart } from '../../src/landlord/web/components/CommunityMarket/PriceChart';

const EOK = 100000000;

describe('시세 차트 축', () => {
  it('세로축 눈금은 2~3개의 보기 좋은 값(억)', () => {
    expect(axisTicks(7 * EOK, 13 * EOK).map(formatTick)).toEqual(['8억', '10억', '12억']);
    expect(axisTicks(10.3 * EOK, 10.9 * EOK).map(formatTick)).toEqual(['10.4억', '10.6억', '10.8억']);
    // 월세 금액처럼 1억보다 작으면 만 단위
    expect(axisTicks(2000000, 3200000).map(formatTick)).toEqual(['200만', '250만', '300만']);
    expect(axisTicks(5, 5)).toEqual([]);
  });

  it('가로축은 마지막 달에서 거꾸로 3개월마다(12개월이면 4개), 세로축 글자는 가로선 옆에', () => {
    const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const values = [9, 9.5, 10, 10.2, null, 10.4, 10.5, null, null, 10.8, 11, 12].map((value) => (value === null ? null : value * EOK));
    const { container } = render(<PriceChart months={months} series={[{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', values }]} />);
    expect([...container.querySelectorAll('[data-tick="x"]')].map((text) => text.textContent)).toEqual(['26-01', '26-04', '26-07', '26-10']);
    const yTicks = [...container.querySelectorAll('[data-tick="y"]')].map((text) => text.textContent);
    expect(yTicks.length).toBeGreaterThanOrEqual(2);
    expect(yTicks.length).toBeLessThanOrEqual(3);
    // 빈 달(26-03 · 26-06 · 26-07)을 건너는 점선 둘, 점은 거래 있는 달 9개
    expect(container.querySelectorAll('[data-segment="gap"]')).toHaveLength(2);
    expect(container.querySelectorAll('circle[data-month]')).toHaveLength(9);
  });

  it('세로축 글자는 그래프 영역 바깥 왼쪽 여백에(오른쪽 정렬) — 첫 점 · 가로선보다 왼쪽이라 겹치지 않는다', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    const { container } = render(<PriceChart months={months} series={[{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', values: [10 * EOK, 20 * EOK, 30 * EOK] }]} />);
    const firstDotX = Math.min(...[...container.querySelectorAll('circle[data-month]')].map((dot) => Number(dot.getAttribute('cx'))));
    const gridStartX = Math.min(...[...container.querySelectorAll('line.stroke-line')].map((line) => Number(line.getAttribute('x1'))));
    const labels = [...container.querySelectorAll('[data-tick="y"]')];
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const label of labels) {
      expect(label).toHaveAttribute('text-anchor', 'end');
      expect(Number(label.getAttribute('x'))).toBeLessThan(gridStartX);
      expect(Number(label.getAttribute('x'))).toBeLessThan(firstDotX);
      expect(label.getAttribute('class')).not.toContain('stroke-surface');
    }
  });
});

describe('시세 차트 — 못 모은 달(#267 2차)', () => {
  const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const line = (values, missing) => ({ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', values: values.map((v) => (v === null ? null : v * EOK)), missing });

  it('못 모은 달은 선을 끊고 비운다 — 그 달을 건너는 점선이 없다. 거래 없는 달은 지금처럼 점선', () => {
    // 26-02 · 26-03 못 모음(값 없음), 26-06 은 모은 달인데 거래 없음
    const values = [9, 9.5, 10, null, null, 10.4, 10.5, null, 10.7, 10.8, 11, 12];
    const missing = MONTHS.map((month) => month === '2026-02' || month === '2026-03');
    const { container } = render(<PriceChart months={MONTHS} series={[line(values, missing)]} />);
    const gaps = [...container.querySelectorAll('[data-segment="gap"]')];
    // 점선은 거래 없는 26-06 을 건너는 것 하나뿐 — 26-01 → 26-04(못 모은 달을 건넘)는 잇지 않는다
    expect(gaps).toHaveLength(1);
    const dotX = (month) => Number(container.querySelector(`circle[data-month="${month}"]`).getAttribute('cx'));
    expect([Number(gaps[0].getAttribute('x1')), Number(gaps[0].getAttribute('x2'))]).toEqual([dotX('2026-05'), dotX('2026-07')]);
    // 실선 조각은 못 모은 달 앞(25-11 ~ 26-01) · 뒤(26-04 ~ 26-05) · 26-07 ~ 26-10 셋
    expect(container.querySelectorAll('[data-segment="solid"]')).toHaveLength(3);
    // 못 모은 달에는 점이 없다
    expect(container.querySelector('circle[data-month="2026-02"]')).toBeNull();
  });

  it('못 모은 달에 옅은 배경 띠(기존 토큰 surface-2) + "수집 중" 글자, 읽어 주는 이름에도 "수집 중 n개월"', () => {
    const missing = MONTHS.map((_, index) => index < 5); // 오래된 5개월
    const values = [null, null, null, null, null, 10.4, 10.5, 10.6, 10.7, 10.8, 11, 12];
    const { container } = render(<PriceChart months={MONTHS} series={[line(values, missing)]} />);
    const bands = container.querySelectorAll('[data-missing-band]');
    expect(bands).toHaveLength(1);
    expect(bands[0]).toHaveAttribute('data-missing-band', '2025-11~2026-03');
    expect(bands[0].querySelector('rect')).toHaveClass('fill-surface-2');
    expect(bands[0].querySelector('[data-missing-label]')).toHaveTextContent('수집 중');
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', '최근 12개월 매매 추이 · 수집 중 5개월');
    expect(container.querySelectorAll('[data-segment="gap"]')).toHaveLength(0);
  });

  it('띠가 글자보다 좁으면(휴대폰 작은 차트의 한 달) 글자 없이 띠만 — 범례 "수집 중" 이 알린다', () => {
    const missing = MONTHS.map((month) => month === '2026-10');
    const values = [9, 9.5, 10, 10.1, 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 11, null];
    const { container } = render(<PriceChart months={MONTHS} width={316} height={96} series={[line(values, missing)]} />);
    expect(container.querySelectorAll('[data-missing-band]')).toHaveLength(1);
    expect(container.querySelector('[data-missing-label]')).toBeNull();
    expect(hasMissingMonths([line(values, missing)])).toBe(true);
    render(<MissingLegend />);
    expect(screen.getByText('수집 중')).toBeInTheDocument();
  });

  it('못 모은 달이 없으면(다 모음 · READY) 띠 · 범례 없음 — 지금 차트 그대로', () => {
    const values = [9, 9.5, 10, null, 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 11, 12];
    const { container } = render(<PriceChart months={MONTHS} series={[line(values)]} />);
    expect(container.querySelector('[data-missing-band]')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', '최근 12개월 매매 추이');
    expect(container.querySelectorAll('[data-segment="gap"]')).toHaveLength(1);
    expect(hasMissingMonths([line(values)])).toBe(false);
  });
});
