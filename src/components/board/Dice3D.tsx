import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../stores/settings';

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

// Rotation that brings each face to the front.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  2: { x: 90, y: 0 },
};

const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  5: 'rotateX(90deg)',
  2: 'rotateX(-90deg)',
};

function Face({ value, half }: { value: number; half: number }) {
  return (
    <div className="dice-face" style={{ transform: `${FACE_TRANSFORM[value]} translateZ(${half}px)` }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i}>{PIPS[value].includes(i + 1) && <span className="dice-pip block" />}</span>
      ))}
    </div>
  );
}

/** One CSS-3D die. `rollKey` changes trigger a spin that lands on `value`. */
export function Die({ value, rollKey, size = 56, idle }: { value: number; rollKey: string | number; size?: number; idle?: boolean }) {
  const reduced = useReducedMotion();
  const spins = useRef(0);
  const [target, setTarget] = useState(() => FACE_ROT[value]);
  useEffect(() => {
    spins.current += 2;
    const f = FACE_ROT[value];
    setTarget({ x: f.x + 360 * spins.current, y: f.y + 360 * (spins.current + 1) });
  }, [rollKey, value]);
  const half = size / 2;
  return (
    <div className="dice-scene" style={{ width: size, height: size }} role="img" aria-label={`Die showing ${value}`}>
      <motion.div
        className="dice-cube h-full w-full"
        animate={idle && !reduced ? { rotateX: [-20, 340], rotateY: [30, 390] } : { rotateX: target.x, rotateY: target.y }}
        transition={
          idle && !reduced
            ? { duration: 9, repeat: Infinity, ease: 'linear' }
            : reduced
              ? { duration: 0 }
              : { duration: 0.9, ease: [0.2, 0.8, 0.3, 1] }
        }
      >
        {[1, 2, 3, 4, 5, 6].map((v) => (
          <Face key={v} value={v} half={half} />
        ))}
      </motion.div>
    </div>
  );
}

export function DicePair({ first, second, rollKey, size }: { first: number; second: number; rollKey: string | number; size?: number }) {
  return (
    <div className="flex items-center gap-4" aria-live="polite" aria-label={`Dice: ${first} and ${second}, total ${first + second}`}>
      <Die value={first} rollKey={rollKey} size={size} />
      <Die value={second} rollKey={`${rollKey}-b`} size={size} />
    </div>
  );
}
