import React from 'react';
import { getBlockStyle, getHexLuminance } from '../game/skins';
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
  const pieceRows = Math.max(1, piece.cells.length);
  const pieceCols = Math.max(1, piece.cells[0]?.length ?? 2);
  const maxSpan = Math.max(2, pieceRows, pieceCols);
  const effCell = maxSpan > 2 ? Math.max(9, Math.floor(total / maxSpan)) : cellSize;
  const offsetX = (total - pieceCols * effCell) * 0.5;
  const offsetY = (total - pieceRows * effCell) * 0.5;

  return (
    <svg
      width={total}
      height={total}
      viewBox={`0 0 ${total} ${total}`}
      aria-hidden="true"
      className="block shrink-0"
    >
      {piece.cells.map((rowCells, py) =>
        rowCells.map((pCell, px) => {
          if (!pCell) return null;
          const x = offsetX + px * effCell;
          const y = offsetY + py * effCell;
          const cx = x + effCell / 2;
          const cy = y + effCell / 2;

          if (pCell.isBlocked) {
            const br = Math.max(1.5, Math.round(effCell * 0.14));
            const m = Math.max(2.2, effCell * 0.28);
            return (
              <g key={`${py}-${px}`}>
                <rect
                  x={x + 0.5}
                  y={y + 0.5}
                  width={Math.max(2, effCell - 1)}
                  height={Math.max(2, effCell - 1)}
                  rx={br}
                  fill="#221d2d"
                  stroke="#524869"
                  strokeWidth={1.1}
                />
                <rect
                  x={x + 2}
                  y={y + 2}
                  width={Math.max(2, effCell - 4)}
                  height={Math.max(2, effCell - 4)}
                  rx={Math.max(0.5, br * 0.5)}
                  fill="none"
                  stroke="#3b334c"
                  strokeWidth={0.8}
                />
                <line
                  x1={x + m}
                  y1={y + m}
                  x2={x + effCell - m}
                  y2={y + effCell - m}
                  stroke="#877ca1"
                  strokeWidth={Math.max(1.2, effCell * 0.11)}
                  strokeLinecap="round"
                />
                <line
                  x1={x + effCell - m}
                  y1={y + m}
                  x2={x + m}
                  y2={y + effCell - m}
                  stroke="#877ca1"
                  strokeWidth={Math.max(1.2, effCell * 0.11)}
                  strokeLinecap="round"
                />
              </g>
            );
          }

          const style = getBlockStyle(skin.palette, pCell.color);

          const baseR =
            pCell.color === 0
              ? Math.max(2, Math.round(effCell * 0.22))
              : pCell.color === 2
              ? Math.max(1.5, Math.round(effCell * 0.14))
              : Math.max(1, Math.round(effCell * 0.05));

          const jTop =
            !pCell.isWild &&
            py > 0 &&
            !piece.cells[py - 1]?.[px]?.isBlocked &&
            !piece.cells[py - 1]?.[px]?.isWild &&
            piece.cells[py - 1]?.[px]?.color === pCell.color;
          const jBottom =
            !pCell.isWild &&
            py + 1 < pieceRows &&
            !piece.cells[py + 1]?.[px]?.isBlocked &&
            !piece.cells[py + 1]?.[px]?.isWild &&
            piece.cells[py + 1]?.[px]?.color === pCell.color;
          const jLeft =
            !pCell.isWild &&
            px > 0 &&
            !piece.cells[py]?.[px - 1]?.isBlocked &&
            !piece.cells[py]?.[px - 1]?.isWild &&
            piece.cells[py]?.[px - 1]?.color === pCell.color;
          const jRight =
            !pCell.isWild &&
            px + 1 < pieceCols &&
            !piece.cells[py]?.[px + 1]?.isBlocked &&
            !piece.cells[py]?.[px + 1]?.isWild &&
            piece.cells[py]?.[px + 1]?.color === pCell.color;

          const w = jRight ? effCell + 0.5 : effCell;
          const h = jBottom ? effCell + 0.5 : effCell;

          const rTL = !jTop && !jLeft ? baseR : 0;
          const rTR = !jTop && !jRight ? baseR : 0;
          const rBR = !jBottom && !jRight ? baseR : 0;
          const rBL = !jBottom && !jLeft ? baseR : 0;

          const strokeWidth = style.strokeVariant === 'painterly' ? 1.4 : 1.05;

          return (
            <g key={`${py}-${px}`}>
              <path
                d={buildSelectiveRoundedRectPath(x, y, w, h, rTL, rTR, rBR, rBL)}
                fill={pCell.isWild ? skin.palette.squareHighlight : style.fill}
              />
              {pCell.isWild && (
                <polygon
                  points={`${cx},${cy - effCell * 0.28} ${cx + effCell * 0.28},${cy} ${cx},${cy + effCell * 0.28} ${cx - effCell * 0.28},${cy}`}
                  fill="#faf6ee"
                  stroke={skin.palette.hudAccent}
                  strokeWidth={1.1}
                />
              )}
              {style.fillVariant === 'concentric' && !pCell.isChain && !pCell.isWild && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={effCell * 0.28}
                  fill="none"
                  stroke={style.highlight}
                  strokeWidth={Math.max(1.1, effCell * 0.11)}
                  opacity={0.42}
                />
              )}
              {style.fillVariant === 'split_plane' && !pCell.isChain && !pCell.isWild && (
                <polygon
                  points={`${x + 1},${y + 1} ${x + effCell - 1},${y + 1} ${x + 1},${y + effCell - 1}`}
                  fill={style.highlight}
                  opacity={0.18}
                />
              )}
              {style.strokeVariant === 'double' && (
                <rect
                  x={x + 2}
                  y={y + 2}
                  width={Math.max(2, effCell - 4)}
                  height={Math.max(2, effCell - 4)}
                  rx={Math.max(0.5, baseR * 0.5)}
                  fill="none"
                  stroke={style.emblemColor}
                  strokeWidth={0.75}
                  opacity={0.35}
                />
              )}
              {!jTop && (
                <line
                  x1={x + rTL}
                  y1={y + 0.6}
                  x2={x + effCell - rTR}
                  y2={y + 0.6}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jBottom && (
                <line
                  x1={x + rBL}
                  y1={y + effCell - 0.6}
                  x2={x + effCell - rBR}
                  y2={y + effCell - 0.6}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jLeft && (
                <line
                  x1={x + 0.6}
                  y1={y + rTL}
                  x2={x + 0.6}
                  y2={y + effCell - rBL}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {!jRight && (
                <line
                  x1={x + effCell - 0.6}
                  y1={y + rTR}
                  x2={x + effCell - 0.6}
                  y2={y + effCell - rBR}
                  stroke={style.border}
                  strokeWidth={strokeWidth}
                />
              )}
              {pCell.isChain && (() => {
                const chainFill =
                  getHexLuminance(style.fill) > 0.78 &&
                  getHexLuminance(style.emblemColor) < 0.45
                    ? style.emblemColor
                    : '#faf6ee';
                return (
                  <g>
                    <rect
                      x={cx - effCell * 0.25}
                      y={cy - effCell * 0.08}
                      width={effCell * 0.5}
                      height={effCell * 0.16}
                      fill={chainFill}
                    />
                    <rect
                      x={cx - effCell * 0.08}
                      y={cy - effCell * 0.25}
                      width={effCell * 0.16}
                      height={effCell * 0.5}
                      fill={chainFill}
                    />
                  </g>
                );
              })()}
            </g>
          );
        })
      )}
    </svg>
  );
};
