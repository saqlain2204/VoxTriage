import type { FC } from "react";
import type { PriorityCount } from "../store/patientStore";

interface Props {
  data: PriorityCount[];
}

/**
 * Donut chart showing the distribution of triage priorities.
 * Pure SVG — no external chart library needed.
 */
export const PriorityChart: FC<Props> = ({ data }) => {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return <ChartEmpty label="No triage data yet" />;

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const strokeWidth = 24;

  // Build arc segments.
  let cumulativeAngle = -90; // start at top
  const segments = data.map((d) => {
    const angle = (d.count / total) * 360;
    const start = cumulativeAngle;
    cumulativeAngle += angle;
    return { ...d, startAngle: start, endAngle: start + angle };
  });

  function polarToCartesian(angleDeg: number) {
    const rad = (Math.PI / 180) * angleDeg;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(startAngle: number, endAngle: number) {
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  return (
    <div className="chart-container">
      <svg viewBox={`0 0 ${size} ${size}`} className="donut-chart">
        {segments.map((seg, i) => (
          <path
            key={i}
            d={arcPath(seg.startAngle, seg.endAngle - 0.5)}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" className="donut-chart__total">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="donut-chart__label">
          Patients
        </text>
      </svg>
      <div className="chart-legend">
        {data.map((d, i) => (
          <div key={i} className="chart-legend__item">
            <span className="chart-legend__dot" style={{ background: d.color }} />
            <span className="chart-legend__text">{d.priority}</span>
            <span className="chart-legend__count">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Bar chart for age distribution ── */

interface BarProps {
  data: Array<{ label: string; value: number }>;
  barColor?: string;
  title?: string;
}

export const BarChart: FC<BarProps> = ({ data, barColor = "#f97316" }) => {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) return <ChartEmpty label="No data" />;

  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-chart__row">
          <span className="bar-chart__label">{d.label}</span>
          <div className="bar-chart__track">
            <div
              className="bar-chart__fill"
              style={{
                width: `${(d.value / maxVal) * 100}%`,
                background: barColor,
              }}
            />
          </div>
          <span className="bar-chart__value">{d.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Stat card ── */

interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

export const StatCard: FC<StatProps> = ({ label, value, sub, accent }) => (
  <div className={`stat-card ${accent ? "stat-card--accent" : ""}`}>
    <div className="stat-card__value">{value}</div>
    <div className="stat-card__label">{label}</div>
    {sub && <div className="stat-card__sub">{sub}</div>}
  </div>
);

/* ── Mini sparkline ── */

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline: FC<SparklineProps> = ({
  data,
  color = "#f97316",
  width = 120,
  height = 32,
}) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/* ── Empty state for charts ── */

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="chart-empty">
      <span>{label}</span>
    </div>
  );
}
