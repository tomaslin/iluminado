import React from 'react';
import { Piece, SkinConfig } from '../game/types';

interface PiecePreviewProps {
  piece: Piece;
  skin: SkinConfig;
  cellSize?: number;
}

function buildSelectiveRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rTL: number,
  rTR: number,
  rBR: number,
  rBL: number
): string {
  return [
    `M ${x + rTL} ${y}`,
    `L ${x + w - rTR} ${y}`,
    rTR > 0 ? `Q ${x + w} ${y} ${x + w} ${y + rTR}` : `L ${x + w} ${y}`,
    `L ${x + w} ${y + h - rBR}`,
    rBR > 0 ? `Q ${x + w} ${y + h} ${x + w - rBR} ${y + h}` : `L ${x + w} ${y + h}`,
    `L ${x + rBL} ${y + h}`,
    rBL > 0 ? `Q ${x} ${y + h} ${x} ${y + h - rBL}` : `L ${x} ${y + h}`,
    `L ${x} ${y + rTL}`,
    rTL > 0 ? `Q ${x} ${y} ${x + rTL} ${y}` : `L ${x} ${y}`,
    'Z',
  ].join(' ');
}

export const PiecePreview: React.FC<PiecePreviewProps> = ({
  piece,
  skin,
  cellSize = 20,
}) => {
  const total = cellSize * 2;

  return (
    <svg
      width={total}
      height={total}
      viewBox={`0 0 ${total} ${total}`}
      aria-hidden="true"
      className="block shrink-0"
    >
      {[0, 1].map((py) =>
        [0, 1].map((px) => {
          const pCell = piece.cells[py][px];
          const style =
            pCell.color === 0 ? skin.palette.blockA : skin.palette.blockB;

          const baseR =
            pCell.color === 0
              ? Math.max(2, Math.round(cellSize * 0.22))
              : Math.max(1, Math.round(cellSize * 0.05));

          const jTop = py === 1 && piece.cells[0][px].color === pCell.color;
          const jBottom = py === 0 && piece.cells[1][px].color === pCell.color;
          const jLeft = px === 1 && piece.cells[py][0].color === pCell.color;
          const jRight = px === 0 && piece.cells[py][1].color === pCell.color;

          const x = px * cellSize;
          const y = py * cellSize;
          const w = jRight ? cellSize + 0.5 : cellSize;
          const h = jBottom ? cellSize + 0.5 : cellSize;

          const rTL = !jTop && !jLeft ? baseR : 0;
          const rTR = !jTop && !jRight ? baseR : 0;
          const rBR = !jBottom && !jRight ? baseR : 0;
          const rBL = !jBottom && !jLeft ? baseR : 0;

          const cx = x + cellSize / 2;
          const cy = y + cellSize / 2;
          const strokeWidth = style.strokeVariant === 'painterly' ? 1.5 : 1.1;

          return (
            <g key={`${py}-${px}`}>
              <path
                d={buildSelectiveRoundedRectPath(x, y, w, h, rTL, rTR, rBR, rBL)}
                fill={style.fill}
              />
              {style.fillVariant === 'concentric' && !pCell.isChain && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={cellSize * 0.28}
                  fill="none"
                  stroke={style.highlight}
                  strokeWidth={Math.max(1.2, cellSize * 0.11)}
                  opacity={0.42}
                />
              )}
              {style.fillVariant === 'split_plane' && !pCell.isChain && (
                <polygon
                  points={`${x + 1},${y + 1} ${x + cellSize - 1},${y + 1} ${x + 1},${y + cellSize - 1}`}
                  fill={style.highlight}
                  opacity={0.18}
                />
              )}
              {style.strokeVariant === 'double' && (
                <rect
                  x={x + 2.4}
                  y={y + 2.4}
                  width={Math.max(2, cellSize - 4.8)}
                  height={Math.max(2, cellSize - 4.8)}
                  rx={Math.max(0.5, baseR * 0.5)}
                  fill="none"
                  stroke={style.emblemColor}
                  strokeWidth={0.8}
                  opacity={0.35}
                />
              )}
              {!jTop && (
                <line
                  x1={x + rTL}
                  y1={y + 0.6}
                  x2={x + cellSize - rTR}
                  y2={y + 0.6}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jBottom && (
                <line
                  x1={x + rBL}
                  y1={y + cellSize - 0.6}
                  x2={x + cellSize - rBR}
                  y2={y + cellSize - 0.6}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jLeft && (
                <line
                  x1={x + 0.6}
                  y1={y + rTL}
                  x2={x + 0.6}
                  y2={y + cellSize - rBL}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jRight && (
                <line
                  x1={x + cellSize - 0.6}
                  y1={y + rTR}
                  x2={x + cellSize - 0.6}
                  y2={y + cellSize - rBR}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {pCell.isChain && (
                <g>
                  <rect
                    x={cx - cellSize * 0.25}
                    y={cy - cellSize * 0.08}
                    width={cellSize * 0.5}
                    height={cellSize * 0.16}
                    fill="#faf6ee"
                  />
                  <rect
                    x={cx - cellSize * 0.08}
                    y={cy - cellSize * 0.25}
                    width={cellSize * 0.16}
                    height={cellSize * 0.5}
                    fill="#faf6ee"
                  />
                </g>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
};
