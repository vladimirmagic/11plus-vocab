import React from 'react';

function getLeafColor(healthPercent) {
  if (healthPercent >= 80) return '#4CAF50';
  if (healthPercent >= 60) return '#8BC34A';
  if (healthPercent >= 40) return '#FFC107';
  if (healthPercent >= 20) return '#A0522D';
  return '#9E9E9E';
}

function GrowthTree({ stage = 1, healthPercent = 100 }) {
  const s = Math.max(1, Math.min(6, stage));
  const hp = Math.max(0, Math.min(100, healthPercent));
  const leafColor = getLeafColor(hp);
  const fillStyle = { transition: 'fill 1s ease' };
  const showFlowers = hp > 60;

  // Trunk dimensions grow with stage
  const trunkHeight = [0, 10, 30, 50, 65, 80, 90][s];
  const trunkWidth = [0, 0, 4, 6, 8, 10, 14][s];
  const trunkX = 60 - trunkWidth / 2;
  const trunkBottom = 140;
  const trunkTop = trunkBottom - trunkHeight;

  return (
    <svg
      viewBox="0 0 120 160"
      width="120"
      height="160"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ground */}
      <ellipse cx="60" cy="145" rx="55" ry="12" fill="#8B7355" />
      <ellipse cx="60" cy="143" rx="50" ry="8" fill="#6B8E23" opacity="0.4" />

      {/* Stage 1: Seed */}
      {s === 1 && (
        <>
          <ellipse cx="60" cy="138" rx="8" ry="5" fill="#A0522D" />
          <ellipse cx="60" cy="137" rx="6" ry="3" fill="#8B6914" />
          <ellipse cx="58" cy="136" rx="2" ry="1.5" fill="#C4A44A" opacity="0.5" />
        </>
      )}

      {/* Stage 2+: Trunk */}
      {s >= 2 && (
        <rect
          x={trunkX}
          y={trunkTop}
          width={trunkWidth}
          height={trunkHeight}
          rx="3"
          fill="#8B6914"
        />
      )}

      {/* Stage 2: Sprout - thin stem with 1-2 small leaves */}
      {s === 2 && (
        <>
          <ellipse
            cx="52"
            cy={trunkTop + 5}
            rx="6"
            ry="3"
            fill={leafColor}
            style={fillStyle}
            transform={`rotate(-30, 52, ${trunkTop + 5})`}
          />
          <ellipse
            cx="68"
            cy={trunkTop + 10}
            rx="5"
            ry="2.5"
            fill={leafColor}
            style={fillStyle}
            transform={`rotate(25, 68, ${trunkTop + 10})`}
          />
        </>
      )}

      {/* Stage 3+: Branches and leaves */}
      {s >= 3 && (
        <>
          {/* Branch left 1 */}
          <line x1="60" y1={trunkTop + 15} x2="38" y2={trunkTop + 5} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="35" cy={trunkTop + 3} rx="8" ry="5" fill={leafColor} style={fillStyle} />

          {/* Branch right 1 */}
          <line x1="60" y1={trunkTop + 12} x2="82" y2={trunkTop + 2} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="85" cy={trunkTop} rx="8" ry="5" fill={leafColor} style={fillStyle} />

          {/* Branch left 2 */}
          <line x1="60" y1={trunkTop + 25} x2="42" y2={trunkTop + 18} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="39" cy={trunkTop + 16} rx="7" ry="4" fill={leafColor} style={fillStyle} />

          {/* Top leaves */}
          <ellipse cx="60" cy={trunkTop - 3} rx="10" ry="6" fill={leafColor} style={fillStyle} />
        </>
      )}

      {/* Stage 4+: More branches, flowers */}
      {s >= 4 && (
        <>
          {/* Additional branches */}
          <line x1="60" y1={trunkTop + 8} x2="30" y2={trunkTop - 5} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="27" cy={trunkTop - 7} rx="9" ry="5" fill={leafColor} style={fillStyle} />

          <line x1="60" y1={trunkTop + 8} x2="90" y2={trunkTop - 5} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="93" cy={trunkTop - 7} rx="9" ry="5" fill={leafColor} style={fillStyle} />

          <line x1="60" y1={trunkTop + 30} x2="35" y2={trunkTop + 25} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="32" cy={trunkTop + 23} rx="7" ry="4" fill={leafColor} style={fillStyle} />

          <line x1="60" y1={trunkTop + 30} x2="85" y2={trunkTop + 25} stroke="#8B6914" strokeWidth="2" />
          <ellipse cx="88" cy={trunkTop + 23} rx="7" ry="4" fill={leafColor} style={fillStyle} />

          {/* Flowers (only when health > 60) */}
          {showFlowers && (
            <>
              <circle cx="40" cy={trunkTop} r="3" fill="#FF69B4" />
              <circle cx="80" cy={trunkTop - 2} r="3" fill="#FF69B4" />
              <circle cx="55" cy={trunkTop - 6} r="2.5" fill="#FFB6C1" />
            </>
          )}
        </>
      )}

      {/* Stage 5+: Full canopy, birds, more flowers */}
      {s >= 5 && (
        <>
          {/* Full canopy - large overlapping leaf clusters */}
          <ellipse cx="45" cy={trunkTop - 10} rx="18" ry="12" fill={leafColor} style={fillStyle} opacity="0.85" />
          <ellipse cx="75" cy={trunkTop - 10} rx="18" ry="12" fill={leafColor} style={fillStyle} opacity="0.85" />
          <ellipse cx="60" cy={trunkTop - 15} rx="20" ry="13" fill={leafColor} style={fillStyle} opacity="0.9" />

          {/* More flowers */}
          {showFlowers && (
            <>
              <circle cx="48" cy={trunkTop - 15} r="3" fill="#FF69B4" />
              <circle cx="72" cy={trunkTop - 12} r="2.5" fill="#FFB6C1" />
              <circle cx="60" cy={trunkTop - 20} r="3" fill="#FF69B4" />
              <circle cx="35" cy={trunkTop - 5} r="2" fill="#FFB6C1" />
            </>
          )}

          {/* Birds */}
          <text x="20" y={trunkTop - 15} fontSize="10" textAnchor="middle">
            {'🐦'}
          </text>
          <text x="100" y={trunkTop - 8} fontSize="9" textAnchor="middle">
            {'🐦'}
          </text>
        </>
      )}

      {/* Stage 6: Grand tree - golden highlights, butterflies, fruit */}
      {s >= 6 && (
        <>
          {/* Extra grand canopy layers with golden tint */}
          <ellipse cx="40" cy={trunkTop - 18} rx="16" ry="10" fill="#DAA520" style={fillStyle} opacity="0.4" />
          <ellipse cx="80" cy={trunkTop - 18} rx="16" ry="10" fill="#DAA520" style={fillStyle} opacity="0.4" />
          <ellipse cx="60" cy={trunkTop - 22} rx="22" ry="14" fill="#DAA520" style={fillStyle} opacity="0.3" />

          {/* Red fruit */}
          <circle cx="42" cy={trunkTop + 5} r="4" fill="#E53935" />
          <circle cx="78" cy={trunkTop + 3} r="4" fill="#E53935" />
          <circle cx="34" cy={trunkTop - 2} r="3.5" fill="#D32F2F" />
          <circle cx="86" cy={trunkTop - 4} r="3.5" fill="#D32F2F" />
          <circle cx="60" cy={trunkTop - 8} r="4" fill="#E53935" />

          {/* Butterflies */}
          <text x="15" y={trunkTop - 25} fontSize="11" textAnchor="middle">
            {'🦋'}
          </text>
          <text x="105" y={trunkTop - 20} fontSize="10" textAnchor="middle">
            {'🦋'}
          </text>
          <text x="60" y={trunkTop - 30} fontSize="9" textAnchor="middle">
            {'🦋'}
          </text>
        </>
      )}
    </svg>
  );
}

export default GrowthTree;
