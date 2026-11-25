// 버튼으로 만든 라디오 묶음(role="radiogroup" / role="radio")의 키보드 이동(WAI-ARIA 라디오 그룹 방식).
// - Tab 으로는 묶음 안의 한 칸(고른 칸, 없으면 첫 칸)에만 들어온다 → getRadioTabIndex.
// - 화살표 ←↑ 이전 칸, →↓ 다음 칸(끝에서 처음으로 돈다), Home 첫 칸, End 마지막 칸 → getRadioKeyTarget 이 옮길 칸 번호를 준다.

export const getRadioTabIndex = (index, selectedIndex) => (index === (selectedIndex >= 0 ? selectedIndex : 0) ? 0 : -1);

export const getRadioKeyTarget = (key, index, length) => {
  if (length <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
};

// 키를 받아 옮길 칸이 있으면 기본 동작(스크롤)을 막고, 그 칸을 고르고(onSelect) 포커스를 옮긴다.
// buttons: 묶음 안 라디오 버튼들(같은 순서).
export const handleRadioKeyDown = (event, index, buttons, onSelect) => {
  const target = getRadioKeyTarget(event.key, index, buttons.length);
  if (target === null) return;
  event.preventDefault();
  onSelect(target);
  buttons[target]?.focus();
};
