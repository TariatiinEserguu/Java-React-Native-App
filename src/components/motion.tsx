import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Platform, type StyleProp, type ViewStyle } from 'react-native';

/*
 * Motion system. Every animation in the app takes its timing from here so movement feels like one
 * family: quick, purposeful (it explains where something came from or went), and never in the way.
 * When the OS asks to reduce motion, slides, scales and springs are dropped and at most a short
 * fade remains.
 */

/** The native driver runs animations off the JS thread; react-native-web always animates in JS. */
export const nativeDriver = Platform.OS !== 'web';

export const duration = { fast: 140, base: 220, slow: 320, count: 700 } as const;

export const easing = {
  /** Enters and moves: fast start, long gentle settle. */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** Leaves the screen: accelerates away. */
  exit: Easing.bezier(0.3, 0, 0.8, 0.15),
  /** Number counters. */
  out: Easing.out(Easing.cubic),
};

/** Springs as stiffness / damping / mass. Damping ratios are close to 1, so nothing wobbles. */
export const spring = {
  press: { stiffness: 520, damping: 34, mass: 1 },
  indicator: { stiffness: 360, damping: 34, mass: 1 },
  sheet: { stiffness: 280, damping: 32, mass: 1 },
  pop: { stiffness: 420, damping: 16, mass: 1 },
} as const;

// ---- Reduced motion (one shared subscription for the whole app) ----

let reduced =
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
const reducedListeners = new Set<() => void>();
let reducedStarted = false;

function setReduced(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  reducedListeners.forEach((l) => l());
}

function subscribeReduced(listener: () => void) {
  if (!reducedStarted) {
    reducedStarted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
  }
  reducedListeners.add(listener);
  return () => {
    reducedListeners.delete(listener);
  };
}

const getReduced = () => reduced;

/** True when the user asked the OS to reduce motion. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, getReduced, getReduced);
}

// ---- Small building blocks ----

/** A stable Animated.Value for the lifetime of the component. */
export function useAnimatedNumber(initial: number) {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

export function timing(value: Animated.Value, toValue: number, config: Partial<Animated.TimingAnimationConfig> = {}) {
  return Animated.timing(value, { toValue, duration: duration.base, easing: easing.standard, useNativeDriver: nativeDriver, ...config });
}

export function springTo(value: Animated.Value, toValue: number, config: { stiffness: number; damping: number; mass: number } = spring.indicator) {
  return Animated.spring(value, { toValue, ...config, useNativeDriver: nativeDriver });
}

/** Delay for the n-th item of a list that appears at once. Capped so long lists don't trickle in. */
export function staggerDelay(index: number) {
  return Math.min(index, 8) * 35;
}

/** Items further down than this appear without an entrance animation (they're usually off-screen). */
export const STAGGER_LIMIT = 14;

/**
 * Keeps something mounted while it animates out. `progress` runs 0 → 1 on show and back to 0 on
 * hide; `mounted` turns false only once the exit animation has finished.
 */
export function usePresence(visible: boolean, enter: 'timing' | 'spring' = 'timing') {
  const reduce = useReducedMotion();
  const progress = useAnimatedNumber(0);
  const [mounted, setMounted] = useState(visible);
  // Mount in the same render that shows it, so the first frame can already start animating.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    if (visible) {
      animation = reduce
        ? timing(progress, 1, { duration: duration.fast, easing: easing.out })
        : enter === 'spring'
          ? springTo(progress, 1, spring.sheet)
          : timing(progress, 1);
      animation.start();
    } else {
      animation = timing(progress, 0, { duration: reduce ? duration.fast : 180, easing: easing.exit });
      animation.start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    return () => animation.stop();
  }, [visible, reduce, enter, progress]);

  return { mounted: visible || mounted, progress, reduce };
}

/**
 * Renders the last children it got while `frozen` is true. Used to keep a closing sheet's content
 * on screen while it animates away, even though the parent has already cleared the data.
 */
export const Freeze = memo(
  function Freeze({ children }: { frozen: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (_previous, next) => next.frozen
);

/** Fades and lifts its children in when mounted. Pass `index` to stagger items of a list. */
export function Enter({
  children,
  index,
  delay,
  offset = 10,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const enter = useEnterStyle({ index, delay, offset });
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}

/** The animated style behind <Enter>, for components that animate themselves. */
export function useEnterStyle({ index, delay, offset = 10, enabled = true }: { index?: number; delay?: number; offset?: number; enabled?: boolean } = {}) {
  const reduce = useReducedMotion();
  const skip = !enabled || (index !== undefined && index >= STAGGER_LIMIT);
  const [progress] = useState(() => new Animated.Value(skip ? 1 : 0));
  const wait = delay ?? (index !== undefined ? staggerDelay(index) : 0);

  useEffect(() => {
    if (skip) return;
    const animation = timing(progress, 1, reduce ? { duration: duration.fast, delay: 0 } : { duration: duration.slow, delay: wait });
    animation.start();
    return () => animation.stop();
    // Runs once on mount: re-renders must not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skip) return null;
  return {
    opacity: progress,
    transform: reduce ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }],
  };
}

/** Briefly scales something up and back whenever `value` changes (cart quantities, counters). */
export function usePop(value: unknown) {
  const reduce = useReducedMotion();
  const scale = useAnimatedNumber(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    scale.setValue(1.18);
    const animation = springTo(scale, 1, spring.pop);
    animation.start();
    return () => animation.stop();
  }, [value, reduce, scale]);
  return { transform: [{ scale }] };
}

/** Horizontal shake, e.g. a rejected login. Call the returned function to play it. */
export function useShake() {
  const reduce = useReducedMotion();
  const x = useAnimatedNumber(0);
  const play = () => {
    if (reduce) return;
    x.setValue(0);
    const step = (to: number, ms: number) => timing(x, to, { duration: ms, easing: Easing.linear });
    Animated.sequence([step(10, 45), step(-9, 70), step(6, 60), step(-4, 55), step(0, 50)]).start();
  };
  return { style: { transform: [{ translateX: x }] }, play };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts a number from its previous value to `target` (dashboard figures). */
export function useCountUp(target: number, ms: number = duration.count) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? target : 0);
  const current = useRef(reduce ? target : 0);

  useEffect(() => {
    const from = current.current;
    const started = Date.now();
    let frame = 0;
    const tick = () => {
      const t = reduce || from === target ? 1 : Math.min(1, (Date.now() - started) / ms);
      const value = from + (target - from) * easeOutCubic(t);
      current.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, reduce]);

  return Math.round(shown);
}

/**
 * Animates the next layout change (rows added to or removed from a list). Native only: on web
 * LayoutAnimation does nothing.
 */
export function animateNextLayout() {
  if (reduced || Platform.OS === 'web') return;
  LayoutAnimation.configureNext({
    duration: duration.base,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/**
 * Slides an indicator (tab pill, segment thumb) to the item at `index`. Item positions come from
 * onLayout; until they are known nothing is drawn, and the first placement doesn't animate.
 */
export function useIndicator(index: number, axis: 'x' | 'y' = 'x') {
  const reduce = useReducedMotion();
  const offset = useAnimatedNumber(0);
  const [layouts, setLayouts] = useState<Record<number, { x: number; y: number; width: number; height: number }>>({});
  const placed = useRef(false);
  const target = layouts[index];
  const position = target ? (axis === 'x' ? target.x : target.y) : null;

  useEffect(() => {
    if (position === null) return;
    if (!placed.current || reduce) {
      placed.current = true;
      offset.setValue(position);
      return;
    }
    const animation = springTo(offset, position, spring.indicator);
    animation.start();
    return () => animation.stop();
  }, [position, reduce, offset]);

  const onItemLayout = (i: number) => (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const old = prev[i];
      if (old && old.x === x && old.y === y && old.width === width && old.height === height) return prev;
      return { ...prev, [i]: { x, y, width, height } };
    });
  };

  return { offset, target, onItemLayout };
}
