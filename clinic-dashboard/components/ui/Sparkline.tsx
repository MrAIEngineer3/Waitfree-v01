"use client";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string; // CSS color
  fill?: string;   // CSS color for area (optional)
  className?: string;
  smooth?: boolean; // future
}

function normalize(values: number[]) {
  const arr = values.length ? values : [0];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  return arr.map(v => (v - min) / span);
}

export default function Sparkline({ values, width = 120, height = 28, stroke = 'currentColor', fill, className = '' }: SparklineProps) {
  const n = Math.max(2, values.length);
  const norm = normalize(values);

  const points = norm.map((v, i) => {
    const x = (i / (n - 1)) * (width - 2) + 1; // padding 1px
    const y = (1 - v) * (height - 2) + 1;     // invert, padding 1px
    return `${x},${y}`;
  }).join(' ');

  // Area fill path
  const areaPath = (() => {
    if (!fill) return null;
    const firstX = 1;
    const lastX = width - 1;
    const d = `M ${firstX} ${height-1} L ${points.replace(/ /g, ' L ')} L ${lastX} ${height-1} Z`;
    return <path d={d} fill={fill} stroke="none" />;
  })();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden>
      {areaPath}
      <polyline points={points} fill="none" stroke={stroke} vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
