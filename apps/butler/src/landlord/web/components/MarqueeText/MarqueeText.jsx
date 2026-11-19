// Created: 2026-11-19
// 버스 정류장 전광판처럼 긴 글자를 왼쪽으로 흘려 보낸다. 칸에 다 들어가면 움직이지 않는다.
// 앞부분에서 잠깐 멈춤 → 끝부분이 다 보일 때까지 흐름 → 끝에서 잠깐 멈춤 → 사라졌다가 앞부분으로 다시 나타남. 커서를 올리면 멈춘다.
// 움직임 줄이기 설정이면 흘리지 않고 끝을 말줄임(…)한다.
// Tailwind 설정에 keyframes를 더하지 않으려고 Web Animations API(element.animate)를 쓴다.
import { useEffect, useRef, useState } from 'react';

const SPEED_PX_PER_SECOND = 40;
// 앞부분을 읽을 시간 · 끝부분을 읽을 시간
const START_HOLD_MS = 1200;
const END_HOLD_MS = 2000;
// 끝에서 사라지고 앞부분으로 다시 나타나는 시간(각 멈춤 시간 안에 들어간다)
const FADE_MS = 500;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const MarqueeText = ({ text, className = '' }) => {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  // 칸 밖으로 넘친 폭(px). 0이면 흐르지 않는다.
  const [overflowPx, setOverflowPx] = useState(0);

  // 칸 폭 · 글자 폭이 바뀔 때마다 넘친 폭을 다시 잰다.
  useEffect(() => {
    const box = boxRef.current;
    const measure = () => {
      if (!box || !textRef.current) return;
      // 줄 안 글자(inline)는 scrollWidth가 0이라 실제 그려진 폭으로 잰다.
      const overflow = Math.round(textRef.current.getBoundingClientRect().width - box.clientWidth);
      setOverflowPx(!prefersReducedMotion() && overflow > 1 ? overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    const box = boxRef.current;
    const textElement = textRef.current;
    if (!overflowPx || !box || !textElement) return undefined;

    const scrollMs = (overflowPx / SPEED_PX_PER_SECOND) * 1000;
    const totalMs = START_HOLD_MS + scrollMs + END_HOLD_MS;
    const start = 'translateX(0)';
    const end = `translateX(-${overflowPx}px)`;
    // 한 바퀴: 나타남 → 멈춤(앞) → 흐름 → 멈춤(끝) → 사라짐. 안 보일 때 앞부분으로 돌아가 다음 바퀴를 시작한다.
    // 나타남은 앞 멈춤 시간 안에, 사라짐은 끝 멈춤 시간 안에 들어간다.
    const at = (ms) => ms / totalMs;
    const animation = textElement.animate(
      [
        { transform: start, opacity: 0, offset: 0 },
        { transform: start, opacity: 1, offset: at(FADE_MS) },
        { transform: start, opacity: 1, offset: at(START_HOLD_MS) },
        { transform: end, opacity: 1, offset: at(START_HOLD_MS + scrollMs) },
        { transform: end, opacity: 1, offset: at(totalMs - FADE_MS) },
        { transform: end, opacity: 0, offset: 1 },
      ],
      { duration: totalMs, iterations: Infinity, easing: 'linear' },
    );
    const pause = () => animation.pause();
    const play = () => animation.play();
    box.addEventListener('mouseenter', pause);
    box.addEventListener('mouseleave', play);
    return () => {
      box.removeEventListener('mouseenter', pause);
      box.removeEventListener('mouseleave', play);
      animation.cancel();
    };
  }, [overflowPx, text]);

  return (
    <span ref={boxRef} title={text} className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}>
      {/* 흐를 때는 inline-block이라야 transform이 먹는다. 아닐 때는 줄 글자라 말줄임(…)이 된다. */}
      <span ref={textRef} className={overflowPx ? 'inline-block' : ''}>
        {text}
      </span>
    </span>
  );
};
