// Created: 2026-11-25
// 임대인 앱 하단 시트 열림·닫힘 애니메이션(BottomSheet · useBottomSheet).
// 실패 조건: 열릴 때 올라오지 않음 · 내려가기 전에 닫힘(onClose)이 불림 · 내려간 뒤 닫힘이 안 불림 · 두 번 눌러 두 번 닫힘 ·
// 동작 줄이기·애니메이션이 없는 환경에서 닫힘이 늦거나 안 불림 · closeDisabled 인데 바깥을 누르면 닫힘.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet, useBottomSheet } from '../../src/landlord/app/components/BottomSheet/BottomSheet';

// 닫기 버튼이 sheet.close(onClose)를 부르는 시트(실제 시트들과 같은 모양)
const Harness = ({ onClose, closeDisabled = false, after }) => {
  const sheet = useBottomSheet();
  return (
    <BottomSheet label="테스트 시트" onClose={onClose} closeDisabled={closeDisabled} sheet={sheet}>
      <button type="button" onClick={() => sheet.close(after ?? onClose)}>
        닫기
      </button>
    </BottomSheet>
  );
};

let finishers;
let animateSpy;

const mockAnimate = () => {
  finishers = [];
  animateSpy = vi.fn(function animate(keyframes, options) {
    let resolve;
    const finished = new Promise((done) => {
      resolve = done;
    });
    finishers.push(resolve);
    return { keyframes, options, finished, cancel: vi.fn() };
  });
  Element.prototype.animate = animateSpy;
};

const setReducedMotion = (reduce) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce });
};

const transformCalls = () => animateSpy.mock.calls.filter(([keyframes]) => 'transform' in keyframes[0]).map(([keyframes]) => keyframes);
const finishAll = async () => {
  await act(async () => {
    finishers.forEach((resolve) => resolve());
  });
};

const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  mockAnimate();
  setReducedMotion(false);
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
});

describe('앱 하단 시트 애니메이션', () => {
  it('열리면 아래에서 올라오고 배경이 어두워진다', () => {
    render(<Harness onClose={vi.fn()} />);
    expect(transformCalls()).toEqual([[{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]]);
    expect(animateSpy.mock.calls.some(([keyframes]) => keyframes[0].opacity === 0 && keyframes[1].opacity === 1)).toBe(true);
  });

  it('[닫기]는 내려가는 애니메이션이 끝난 뒤에 onClose 를 부른다', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(transformCalls().at(-1)).toEqual([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }]);
    expect(onClose).not.toHaveBeenCalled();
    await finishAll();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('바깥을 눌러도 내려간 뒤 onClose 를 부른다. 내려가는 중에 다시 눌러도 한 번만 부른다', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: '테스트 시트' });
    await userEvent.click(dialog);
    // 내려가는 동안 시트는 눌리지 않게(pointer-events: none) 막는다. 막음을 건너뛰고 눌러도 두 번 닫지 않는지 본다.
    expect(dialog).toHaveStyle({ pointerEvents: 'none' });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: '닫기' }));
    expect(transformCalls()).toHaveLength(2); // 열림 1 + 닫힘 1
    await finishAll();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('저장 성공처럼 다른 다음 동작을 넘기면 내려간 뒤 그 동작을 부른다', async () => {
    const onClose = vi.fn();
    const after = vi.fn();
    render(<Harness onClose={onClose} after={after} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    await finishAll();
    expect(after).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closeDisabled 면 바깥을 눌러도 닫지 않는다', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeDisabled />);
    await userEvent.click(screen.getByRole('dialog', { name: '테스트 시트' }));
    await finishAll();
    expect(onClose).not.toHaveBeenCalled();
    expect(transformCalls()).toHaveLength(1); // 열림만
  });

  it('기기의 동작 줄이기가 켜져 있으면 움직이지 않고 바로 닫는다', async () => {
    setReducedMotion(true);
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(animateSpy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('애니메이션 API가 없는 환경에서도 바로 닫는다', async () => {
    delete Element.prototype.animate;
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sheet 를 넘기지 않은 시트도 바깥 누르기는 내려간 뒤 닫는다', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet label="단순 시트" onClose={onClose}>
        <p>내용</p>
      </BottomSheet>,
    );
    await userEvent.click(screen.getByRole('dialog', { name: '단순 시트' }));
    expect(onClose).not.toHaveBeenCalled();
    await finishAll();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
