import { describe, expect, it } from 'vitest';
import { getRadioKeyTarget, getRadioTabIndex } from '../../src/shared/radioGroupKeys';

describe('라디오 묶음 키보드', () => {
  it('Tab 은 고른 칸(없으면 첫 칸)에만 들어온다', () => {
    expect([0, 1, 2].map((index) => getRadioTabIndex(index, 1))).toEqual([-1, 0, -1]);
    expect([0, 1, 2].map((index) => getRadioTabIndex(index, -1))).toEqual([0, -1, -1]);
  });

  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowDown', 2, 0],
    ['ArrowLeft', 0, 2],
    ['ArrowUp', 1, 0],
    ['Home', 2, 0],
    ['End', 0, 2],
    ['Enter', 0, null],
  ])('%s (칸 %i, 3칸) → %s', (key, index, expected) => {
    expect(getRadioKeyTarget(key, index, 3)).toBe(expected);
  });
});
