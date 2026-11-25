import { useEffect, useState } from 'react';
import { UNSAFE_LocationContext as LocationContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

// 다른 화면으로 옮길 때 새 화면이 데이터까지 준비된 뒤에 한 번에 바꾼다(스켈레톤이 잠깐 번쩍이지 않게).
// 준비되는 동안 지금 화면은 그대로 보이고 쓸 수 있다. 새 화면은 숨은 채로 그려지며 데이터를 받는다.
// - group이 같은 이동(같은 화면의 팝업·패널·필터)은 기다리지 않고 바로 갱신한다.
// - 준비 = 데이터가 아직 없는 요청이 하나도 없는 상태가 SETTLE_MS 동안 이어질 때(이어지는 요청이 바로 시작하는 경우를 놓치지 않게).
// - 오래 걸려도 MAX_WAIT_MS 가 지나면 그대로 바꾼다(그때부터는 화면의 스켈레톤이 보인다).
// 칸은 둘이다. 보이는 칸과 준비 중인 칸이 서로 자리를 바꿔, 준비된 화면이 다시 만들어지지 않고 그 자리에서 보이게 된다.
// 각 칸의 화면은 자기 주소(slot.location)를 본다. 그래서 옛 화면은 주소가 바뀌어도 그대로 있다.
const SETTLE_MS = 80;
const MAX_WAIT_MS = 3000;

const initialState = (location, group) => ({ shown: 0, slots: [{ location, group }, null] });

export const ReadyGate = ({ location, group, children }) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => initialState(location, group));
  const other = 1 - state.shown;
  const shownSlot = state.slots[state.shown];
  const pendingSlot = state.slots[other];

  // 주소가 바뀌었을 때 칸을 정리한다(렌더 중 state 보정). 같은 묶음이면 보이는 칸을 바로 갱신하고 준비 중인 칸은 버린다.
  if (shownSlot.group === group) {
    if (shownSlot.location !== location || pendingSlot) {
      const slots = [null, null];
      slots[state.shown] = { location, group };
      setState({ shown: state.shown, slots });
    }
  } else if (pendingSlot?.location !== location) {
    const slots = [null, null];
    slots[state.shown] = shownSlot;
    slots[other] = { location, group };
    setState({ shown: state.shown, slots });
  }

  const pendingLocation = pendingSlot?.location;
  useEffect(() => {
    if (!pendingLocation) return undefined;
    const cache = queryClient.getQueryCache();
    const isSettled = () => cache.findAll({ fetchStatus: 'fetching' }).every((query) => query.state.data !== undefined);
    const reveal = () =>
      setState((current) => {
        if (current.slots[1 - current.shown]?.location !== pendingLocation) return current;
        const slots = [null, null];
        slots[1 - current.shown] = current.slots[1 - current.shown];
        return { shown: 1 - current.shown, slots };
      });

    let settleTimer;
    const check = () => {
      clearTimeout(settleTimer);
      if (isSettled()) settleTimer = setTimeout(() => isSettled() && reveal(), SETTLE_MS);
    };
    const unsubscribe = cache.subscribe(check);
    const maxTimer = setTimeout(reveal, MAX_WAIT_MS);
    check();

    return () => {
      unsubscribe();
      clearTimeout(settleTimer);
      clearTimeout(maxTimer);
    };
  }, [pendingLocation, queryClient]);

  return state.slots.map(
    (slot, index) =>
      slot && (
        <div key={index} hidden={index !== state.shown} className={index === state.shown ? 'contents' : undefined}>
          <LocationContext.Provider value={{ location: slot.location, navigationType: 'POP' }}>{children}</LocationContext.Provider>
        </div>
      ),
  );
};
