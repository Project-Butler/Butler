import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axisTicks, formatTick, PriceChart } from '../../src/landlord/web/components/CommunityMarket/PriceChart';

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
