// 하단 탭 아이콘. Figma TabBar/Mobile 이 상태(활성·비활성)마다 선 색을 담아 따로 준 SVG 를 그대로 쓴다(색을 CSS로 바꾸지 않는다).
// 활성 #0E6B5C(accent), 비활성 #5A6863(ink3). 원본: Butler 화면 구조 · IA · 와이어프레임 › 01 Foundations › TabBar/Mobile
import buildingOff from './assets/tab-building-off.svg';
import buildingOn from './assets/tab-building-on.svg';
import homeOff from './assets/tab-home-off.svg';
import homeOn from './assets/tab-home-on.svg';
import userOff from './assets/tab-user-off.svg';
import userOn from './assets/tab-user-on.svg';
import usersOff from './assets/tab-users-off.svg';
import usersOn from './assets/tab-users-on.svg';

export const TAB_ICONS = {
  home: { on: homeOn, off: homeOff },
  building: { on: buildingOn, off: buildingOff },
  users: { on: usersOn, off: usersOff },
  user: { on: userOn, off: userOff },
};
