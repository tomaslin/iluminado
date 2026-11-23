import {
  BOARD_COLS,
  BOARD_ROWS,
  LOCK_DELAY_SEC,
  canPlacePiece,
  computeBeamProximity,
  countMarkedAheadOfBeam,
  getActiveGravityDirection,
  getActiveWellRegion,
  getDiagonalSlantSpan,
  getGravityVector,
  getPieceLandingColumns,
} from './engine';
import { getShiftPolarity, getSweepBeatsForShift } from './shifts';
import {
  compositeColorOnHex,
  getBlockStyle,
  getHexLuminance,
  getWcagContrast,
  getWcagLuminance,
  isHexColorDark,
} from './skins';
import {
  BlockStyle,
  BoardOrientation,
  BoardState,
  Cell,
  CellColor,
  GravityDirection,
  Piece,
  ShiftPolarity,
  SkinConfig,
} from './types';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  rotation: number;
  vRot: number;
  isGlint: boolean;
  shape: SkinConfig['particleShape'] | 'star' | 'diamond' | 'spark';
}

interface GhostClearCell {
  active: boolean;
  boardIdx: 0 | 1;
  gx: number;
  gy: number;
  color: CellColor;
  life: number;
  maxLife: number;
  delay: number;
}

interface PieceVisualSmoothState {
  pieceRef: Piece | null;
  smoothX: number;
  smoothY: number;
  rotAngle: number;
}

interface ClearRing {
  active: boolean;
  x: number;
  y: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface SweepFlare {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  life: number;
  maxLife: number;
  color: string;
}

interface FloatingPopup {
  active: boolean;
  boardIdx: 0 | 1;
  followBoard: boolean;
  x: number;
  y: number;
  text: string;
  subtext: string;
  life: number;
  maxLife: number;
  color: string;
}

interface BgMote {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  depth: number;
}

interface LandingRipple {
  active: boolean;
  boardIdx: 0 | 1;
  col: number;
  row: number;
  life: number;
  maxLife: number;
}

interface DropBeam {
  active: boolean;
  boardIdx: 0 | 1;
  col: number;
  startRow: number;
  colBotRows: number[];
  colColors: (CellColor | null)[];
  gravityDirection: GravityDirection;
  life: number;
  maxLife: number;
}

interface NeighborJoins {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

interface ParallaxCacheSet {
  key: string;
  width: number;
  height: number;
  overscanX: number;
  overscanY: number;
  farTop: number;
  nearTop: number;
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
}

export interface BoardViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cellSize: number;
}

const MAX_PARTICLES = 260;
const MAX_GHOST_CLEARS = 96;
const MAX_BLOCK_SPRITES = 720;
const MAX_RINGS = 64;
const MAX_FLARES = 36;
const MAX_POPUPS = 16;
const MAX_MOTES = 42;
const MAX_LAND_RIPPLES = 16;
const MAX_DROP_BEAMS = 12;
const PARALLAX_OVERSCAN_X = 56;
const PARALLAX_OVERSCAN_Y = 24;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export class IluminadoCanvasRenderer {
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 340,
    size: 6,
    alpha: 1,
    life: 0,
    maxLife: 0.6,
    color: '#faf6ee',
    rotation: 0,
    vRot: 0,
    isGlint: false,
    shape: 'square',
  }));
  private particleCursor = 0;

  private ghostClears: GhostClearCell[] = Array.from({ length: MAX_GHOST_CLEARS }, () => ({
    active: false,
    boardIdx: 0,
    gx: 0,
    gy: 0,
    color: 0,
    life: 0,
    maxLife: 0.3,
    delay: 0,
  }));
  private ghostClearCursor = 0;

  private clearRings: ClearRing[] = Array.from({ length: MAX_RINGS }, () => ({
    active: false,
    x: 0,
    y: 0,
    maxRadius: 28,
    life: 0,
    maxLife: 0.42,
    color: '#faf6ee',
  }));
  private ringCursor = 0;

  private sweepFlares: SweepFlare[] = Array.from({ length: MAX_FLARES }, () => ({
    active: false,
    x: 0,
    y: 0,
    width: 24,
    height: 160,
    life: 0,
    maxLife: 0.55,
    color: '#faf6ee',
  }));
  private flareCursor = 0;

  private popups: FloatingPopup[] = Array.from({ length: MAX_POPUPS }, () => ({
    active: false,
    boardIdx: 0,
    followBoard: true,
    x: 0,
    y: 0,
    text: '',
    subtext: '',
    life: 0,
    maxLife: 1.1,
    color: '#333',
  }));
  private popupCursor = 0;

  private motes: BgMote[] = Array.from({ length: MAX_MOTES }, (_, i) => ({
    x: ((i * 73) % 100) / 100,
    y: ((i * 41) % 100) / 100,
    r: 1.7 + (i % 4) * 1.05,
    speed: 0.007 + (i % 5) * 0.0038,
    phase: i * 0.9,
    depth: 0.45 + (i % 4) * 0.25,
  }));

  private lastPrimaryRect: BoardViewportRect = {
    x: 0,
    y: 0,
    width: 640,
    height: 400,
    cellSize: 40,
  };
  private lastSecondaryRect: BoardViewportRect | null = null;
  private currLayerCache: ParallaxCacheSet | null = null;
  private prevLayerCache: ParallaxCacheSet | null = null;
  private mandalaGlowSprite: HTMLCanvasElement | null = null;

  private landRipples: LandingRipple[] = Array.from({ length: MAX_LAND_RIPPLES }, () => ({
    active: false,
    boardIdx: 0,
    col: 0,
    row: 0,
    life: 0,
    maxLife: 0.65,
  }));
  private landRippleCursor = 0;

  private dropBeams: DropBeam[] = Array.from({ length: MAX_DROP_BEAMS }, () => ({
    active: false,
    boardIdx: 0,
    col: 0,
    startRow: 0,
    colBotRows: [0, 0],
    colColors: [0, 1],
    gravityDirection: 'down' as GravityDirection,
    life: 0,
    maxLife: 0.26,
  }));
  private dropBeamCursor = 0;

  private pointerNormX = 0;
  private pointerNormY = 0;
  private parallaxX = 0;
  private parallaxY = 0;
  private targetParallaxX = 0;
  private targetParallaxY = 0;
  private moveRippleShift = 0;
  private sweepBloom = 0;
  private shiftAnimT = 0;
  private shiftFromX = 0;
  private shiftFromY = 0;
  private shiftScaleFrom = 1;
  private rotateAnimT = 0;
  private rotateAnimDir: 'cw' | 'ccw' = 'cw';
  private rotateFromCellSize: number | null = null;

  private reducedMotion = false;
  private patternMode = false;
  private boardShake = 0;
  private boardZoomKick = 0;
  private boardTremor = 0;
  private shiftFlashT = 0;
  private shiftFlashPolarity: ShiftPolarity = 'neutral';
  private lastFrameDt = 1 / 60;
  private lastRenderTimeSec = 0;
  private blockSpriteCache = new Map<string, HTMLCanvasElement>();
  private blockSpriteSkinKey = '';
  private lanternMaskCanvas: HTMLCanvasElement | null = null;

  private pieceSmooth: [PieceVisualSmoothState, PieceVisualSmoothState] = [
    { pieceRef: null, smoothX: 0, smoothY: 0, rotAngle: 0 },
    { pieceRef: null, smoothX: 0, smoothY: 0, rotAngle: 0 },
  ];

  private tmpJoins: NeighborJoins = { top: false, right: false, bottom: false, left: false };
  private tmpRipple = { liftPx: 0, glow: 0 };
  private tmpBlockFx = {
    row: 0,
    col: 0,
    inSquare: false,
    chainMarked: false,
    pendingClear: false,
    sweptCol: false,
    landFlash: 0,
    rippleGlow: 0,
    beatPhase: 0,
    timeSec: 0,
    shimmerWave: 0,
    isWild: false,
    isCrashGem: false,
    frostHp: 0,
    isVirus: false,
    patternMode: false,
  };
  private tmpBeamCols1 = [0];
  private tmpBeamCols2 = [0, 0];
  private tmpBeamCols3 = [0, 0, 0];

  public setPointerOffset(nx: number, ny: number): void {
    this.pointerNormX = Math.max(-1, Math.min(1, nx));
    this.pointerNormY = Math.max(-1, Math.min(1, ny));
  }

  public triggerMoveShift(dx: -1 | 1): void {
    this.moveRippleShift = Math.max(-16, Math.min(16, this.moveRippleShift + dx * 3.8));
  }

  public triggerLandRipple(boardIdx: 0 | 1, col: number, row: number): void {
    const rip = this.landRipples[this.landRippleCursor];
    this.landRippleCursor = (this.landRippleCursor + 1) % MAX_LAND_RIPPLES;
    rip.active = true;
    rip.boardIdx = boardIdx;
    rip.col = col;
    rip.row = Math.max(0, row);
    rip.life = 0;
    rip.maxLife = 0.62;
  }

  public triggerHardDropBeam(
    boardIdx: 0 | 1,
    col: number,
    startRow: number,
    colBotRows: number[],
    colColors: (CellColor | null)[],
    gravityDirection: GravityDirection = 'down'
  ): void {
    const beam = this.dropBeams[this.dropBeamCursor];
    this.dropBeamCursor = (this.dropBeamCursor + 1) % MAX_DROP_BEAMS;
    beam.active = true;
    beam.boardIdx = boardIdx;
    beam.col = col;
    beam.startRow = startRow;
    beam.colBotRows = colBotRows;
    beam.colColors = colColors;
    beam.gravityDirection = gravityDirection;
    beam.life = 0;
    beam.maxLife = 0.28;
  }

  public triggerOrientationShift(
    fromOrientation: BoardOrientation,
    toOrientation: BoardOrientation
  ): void {
    if (fromOrientation === toOrientation) return;
    const dir = toOrientation === 'portrait' ? 1 : -1;
    this.shiftAnimT = 1;
    this.shiftFromX = dir * 135;
    this.shiftFromY = toOrientation === 'portrait' ? 42 : -36;
    this.shiftScaleFrom = toOrientation === 'portrait' ? 0.94 : 1.05;
    this.targetParallaxX = dir * 32;
    this.sweepBloom = Math.min(1.2, Math.max(this.sweepBloom, 0.45));
  }

  public setAccessibility(opts: { reducedMotion: boolean; patternMode: boolean }): void {
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.patternMode = Boolean(opts.patternMode);
    if (this.reducedMotion) {
      this.boardShake = 0;
      this.boardZoomKick = 0;
      this.boardTremor = 0;
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.targetParallaxX = 0;
      this.targetParallaxY = 0;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        this.particles[i].active = false;
      }
    }
  }

  public triggerPieceRotateTween(boardIdx: 0 | 1, dir: 'cw' | 'ccw'): void {
    if (this.reducedMotion) return;
    const delta = dir === 'cw' ? -Math.PI * 0.42 : Math.PI * 0.42;
    const state = this.pieceSmooth[boardIdx];
    state.rotAngle = Math.max(-Math.PI * 0.55, Math.min(Math.PI * 0.55, state.rotAngle + delta));
  }

  public triggerBoardTremor(strength: number = 0.65): void {
    if (this.reducedMotion) return;
    this.boardTremor = Math.max(this.boardTremor, Math.min(1.5, strength));
  }

  public triggerShiftActivationFlash(polarity: ShiftPolarity = 'neutral'): void {
    this.shiftFlashT = 1;
    this.shiftFlashPolarity = polarity;
    if (!this.reducedMotion) {
      this.boardShake = Math.min(11, Math.max(this.boardShake, 2.4));
      this.boardZoomKick = Math.min(0.036, Math.max(this.boardZoomKick, 0.01));
    }
  }

  public triggerBoardRotate90(direction: 'cw' | 'ccw' = 'cw'): void {
    this.rotateAnimT = 1;
    this.rotateAnimDir = direction;
    this.rotateFromCellSize = this.lastPrimaryRect.cellSize || null;
    this.sweepBloom = Math.min(1.3, Math.max(this.sweepBloom, 0.55));
  }

  public triggerSweepBloom(squaresCleared: number): void {
    if (squaresCleared <= 0) return;
    this.sweepBloom = Math.min(1.4, this.sweepBloom + Math.min(1, 0.3 + squaresCleared * 0.12));
    if (!this.reducedMotion) {
      this.boardShake = Math.min(11, this.boardShake + 1.8 + squaresCleared * 0.95);
      this.boardZoomKick = Math.min(0.036, this.boardZoomKick + 0.006 + squaresCleared * 0.0028);
    }
  }

  public spawnClearBurst(
    boardIdx: 0 | 1,
    positions: Array<{ x: number; y: number; color: CellColor }>,
    skin: SkinConfig
  ): void {
    if (positions.length === 0) return;
    const rect =
      boardIdx === 1 && this.lastSecondaryRect
        ? this.lastSecondaryRect
        : this.lastPrimaryRect;

    const perCellParticles =
      positions.length >= 16 ? 5 : positions.length >= 8 ? 4 : 3;

    for (const pos of positions) {
      const gc = this.ghostClears[this.ghostClearCursor];
      this.ghostClearCursor = (this.ghostClearCursor + 1) % MAX_GHOST_CLEARS;
      gc.active = true;
      gc.boardIdx = boardIdx;
      gc.gx = pos.x;
      gc.gy = pos.y;
      gc.color = pos.color;
      gc.life = 0;
      gc.maxLife = 0.3;
      gc.delay = Math.min(0.055, (pos.x % 4) * 0.011);

      const cx = rect.x + (pos.x + 0.5) * rect.cellSize;
      const cy = rect.y + (pos.y + 0.5) * rect.cellSize;
      const style = getBlockStyle(skin.palette, pos.color);

      if (!this.reducedMotion) {
        for (let i = 0; i < perCellParticles; i++) {
          const p = this.particles[this.particleCursor];
          this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
          const spreadRatio =
            perCellParticles <= 1 ? 0 : (i / (perCellParticles - 1) - 0.5) * 1.9;
          const angle = -Math.PI * 0.5 + spreadRatio + (Math.random() - 0.5) * 0.45;
          const isGlint = i === perCellParticles - 1 || (perCellParticles >= 4 && i === 0);
          const speed = isGlint
            ? 125 + Math.random() * 115
            : 90 + Math.random() * 115;
          p.active = true;
          p.x = cx + (Math.random() - 0.5) * rect.cellSize * 0.28;
          p.y = cy + (Math.random() - 0.5) * rect.cellSize * 0.2;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed - (isGlint ? 55 : 35);
          p.gravity = isGlint ? 240 : 380;
          p.size =
            rect.cellSize *
            (isGlint ? 0.24 + Math.random() * 0.12 : 0.14 + Math.random() * 0.09);
          p.alpha = isGlint ? 0.94 : 0.78;
          p.life = 0;
          p.maxLife = (isGlint ? 0.62 : 0.52) + Math.random() * 0.26;
          p.color = isGlint
            ? skin.palette.squareHighlight
            : i % 2 === 0
            ? style.highlight
            : style.fill;
          p.rotation = Math.random() * Math.PI;
          p.vRot = (Math.random() - 0.5) * (isGlint ? 7.5 : 4.2);
          p.isGlint = isGlint;
          p.shape = isGlint
            ? pos.color === 0
              ? 'star'
              : pos.color === 2
              ? 'spark'
              : 'diamond'
            : pos.color === 0
            ? 'bubble'
            : skin.particleShape;
        }
      }

      const ring = this.clearRings[this.ringCursor];
      this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
      ring.active = true;
      ring.x = cx;
      ring.y = cy;
      ring.maxRadius = rect.cellSize * 1.25;
      ring.life = 0;
      ring.maxLife = 0.45;
      ring.color = style.highlight;

      const flare = this.sweepFlares[this.flareCursor];
      this.flareCursor = (this.flareCursor + 1) % MAX_FLARES;
      flare.active = true;
      flare.x = cx;
      flare.y = cy;
      flare.width = rect.cellSize * 0.78;
      flare.height = rect.height * 0.82;
      flare.life = 0;
      flare.maxLife = 0.52;
      flare.color = style.highlight;
    }
  }

  public spawnSpringBounce(
    boardIdx: 0 | 1,
    gx: number,
    gy: number,
    skin: SkinConfig
  ): void {
    const rect =
      boardIdx === 1 && this.lastSecondaryRect
        ? this.lastSecondaryRect
        : this.lastPrimaryRect;
    const cx = rect.x + (gx + 0.5) * rect.cellSize;
    const cy = rect.y + (gy + 0.5) * rect.cellSize;

    for (let i = 0; i < 6; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const spread = -Math.PI * 0.5 + (i - 2.5) * 0.28 + (Math.random() - 0.5) * 0.14;
      const speed = 38 + Math.random() * 34;
      p.active = true;
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(spread) * speed;
      p.vy = Math.sin(spread) * speed;
      p.gravity = 260;
      p.size = rect.cellSize * (0.14 + Math.random() * 0.08);
      p.alpha = 0.88;
      p.life = 0;
      p.maxLife = 0.36 + Math.random() * 0.14;
      p.color = i % 2 === 0 ? skin.palette.squareHighlight : skin.palette.hudAccent;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 6;
      p.isGlint = i % 2 === 0;
      p.shape = i % 2 === 0 ? 'spark' : 'square';
    }

    const ring = this.clearRings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    ring.active = true;
    ring.x = cx;
    ring.y = cy;
    ring.maxRadius = rect.cellSize * 0.86;
    ring.life = 0;
    ring.maxLife = 0.34;
    ring.color = skin.palette.squareHighlight;
  }

  public spawnScorePopup(
    boardIdx: 0 | 1,
    text: string,
    subtext: string,
    color: string
  ): void {
    const rect =
      boardIdx === 1 && this.lastSecondaryRect
        ? this.lastSecondaryRect
        : this.lastPrimaryRect;
    const pop = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % MAX_POPUPS;
    pop.active = true;
    pop.boardIdx = boardIdx;
    pop.followBoard = true;
    pop.x = rect.x + rect.width * 0.5;
    pop.y = rect.y + rect.height * 0.34;
    pop.text = text;
    pop.subtext = subtext;
    pop.life = 0;
    pop.maxLife = 1.2;
    pop.color = color;
  }

  public updateEffects(dt: number, gridList: (Cell | null)[][][]): void {
    if (this.reducedMotion) {
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.boardShake = 0;
      this.boardZoomKick = 0;
      this.boardTremor = 0;
    } else {
      const damp = 1 - Math.exp(-dt * 3.8);
      this.parallaxX += (this.targetParallaxX - this.parallaxX) * damp;
      this.parallaxY += (this.targetParallaxY - this.parallaxY) * damp;
      if (this.boardShake > 0) {
        this.boardShake = Math.max(0, this.boardShake - dt * 28);
      }
      if (this.boardZoomKick > 0) {
        this.boardZoomKick = Math.max(0, this.boardZoomKick - dt * 0.14);
      }
      if (this.boardTremor > 0) {
        this.boardTremor = Math.max(0, this.boardTremor - dt * 2.4);
      }
    }
    if (this.shiftFlashT > 0) {
      this.shiftFlashT = Math.max(0, this.shiftFlashT - dt * 2.1);
    }
    this.moveRippleShift *= 1 - Math.min(1, dt * 3.2);
    if (Math.abs(this.moveRippleShift) < 0.05) this.moveRippleShift = 0;

    if (this.sweepBloom > 0) {
      this.sweepBloom = Math.max(0, this.sweepBloom - dt * 1.45);
    }
    if (this.shiftAnimT > 0) {
      this.shiftAnimT = Math.max(0, this.shiftAnimT - dt / 0.62);
    }
    const prevRotateT = this.rotateAnimT;
    if (this.rotateAnimT > 0) {
      this.rotateAnimT = Math.max(0, this.rotateAnimT - dt / 0.78);
      if (this.rotateAnimT === 0) {
        this.rotateFromCellSize = null;
      }
    }

    const rotDamp = Math.exp(-dt / 0.024);
    for (let i = 0; i < 2; i++) {
      const ps = this.pieceSmooth[i];
      if (Math.abs(ps.rotAngle) > 0.002) {
        ps.rotAngle *= rotDamp;
        if (Math.abs(ps.rotAngle) <= 0.002) ps.rotAngle = 0;
      }
    }

    const fallRate = prevRotateT > 0.48 ? 0 : prevRotateT > 0 ? 15 : 24;

    const animDamp = 1 - Math.exp(-dt * 8.2);
    for (const grid of gridList) {
      const rows = grid.length;
      const cols = grid[0]?.length ?? BOARD_COLS;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r][c];
          if (!cell) continue;
          if (cell.fallOffset > 0 && fallRate > 0) {
            cell.fallOffset = Math.max(0, cell.fallOffset - dt * fallRate);
          }
          if (cell.landFlash > 0) {
            cell.landFlash = Math.max(0, cell.landFlash - dt * 3.6);
          }
          if (cell.animOffsetX) {
            cell.animOffsetX *= 1 - animDamp;
            if (Math.abs(cell.animOffsetX) < 0.01) cell.animOffsetX = 0;
          }
          if (cell.animOffsetY) {
            cell.animOffsetY *= 1 - animDamp;
            if (Math.abs(cell.animOffsetY) < 0.01) cell.animOffsetY = 0;
          }
        }
      }
    }

    for (let i = 0; i < MAX_LAND_RIPPLES; i++) {
      const rip = this.landRipples[i];
      if (!rip.active) continue;
      rip.life += dt;
      if (rip.life >= rip.maxLife) {
        rip.active = false;
      }
    }

    for (let i = 0; i < MAX_DROP_BEAMS; i++) {
      const beam = this.dropBeams[i];
      if (!beam.active) continue;
      beam.life += dt;
      if (beam.life >= beam.maxLife) {
        beam.active = false;
      }
    }

    for (let i = 0; i < MAX_GHOST_CLEARS; i++) {
      const gc = this.ghostClears[i];
      if (!gc.active) continue;
      if (gc.delay > 0) {
        gc.delay = Math.max(0, gc.delay - dt);
        continue;
      }
      gc.life += dt;
      if (gc.life >= gc.maxLife) {
        gc.active = false;
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 1.35);
      p.vy += p.gravity * dt;
      p.rotation += p.vRot * dt;
      const norm = p.life / p.maxLife;
      p.alpha = (p.isGlint ? 0.92 : 0.75) * (1 - norm) * (1 - norm);
    }

    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = this.clearRings[i];
      if (!ring.active) continue;
      ring.life += dt;
      if (ring.life >= ring.maxLife) {
        ring.active = false;
      }
    }

    for (let i = 0; i < MAX_FLARES; i++) {
      const flare = this.sweepFlares[i];
      if (!flare.active) continue;
      flare.life += dt;
      if (flare.life >= flare.maxLife) {
        flare.active = false;
      }
    }

    for (let i = 0; i < MAX_POPUPS; i++) {
      const pop = this.popups[i];
      if (!pop.active) continue;
      pop.life += dt;
      if (pop.life >= pop.maxLife) {
        pop.active = false;
        continue;
      }
      pop.y -= 24 * dt;
    }

    for (let i = 0; i < MAX_MOTES; i++) {
      const m = this.motes[i];
      m.y -= m.speed * dt;
      if (m.y < -0.05) m.y = 1.05;
    }
  }

  private createOffscreen(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  private getMandalaGlowSprite(): HTMLCanvasElement | null {
    if (this.mandalaGlowSprite || typeof document === 'undefined') {
      return this.mandalaGlowSprite;
    }
    const size = 128;
    const c = this.createOffscreen(size, size);
    const gctx = c.getContext('2d');
    if (gctx) {
      const grad = gctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        size * 0.05,
        size * 0.5,
        size * 0.5,
        size * 0.5
      );
      grad.addColorStop(0, 'rgba(255, 252, 246, 0.18)');
      grad.addColorStop(0.55, 'rgba(255, 250, 242, 0.06)');
      grad.addColorStop(1, 'rgba(255, 250, 242, 0)');
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, size, size);
    }
    this.mandalaGlowSprite = c;
    return c;
  }

  private buildLayerCache(
    width: number,
    height: number,
    skin: SkinConfig,
    reuse?: ParallaxCacheSet | null
  ): ParallaxCacheSet | null {
    if (typeof document === 'undefined' || width <= 0 || height <= 0) return null;
    const key = `${width}x${height}:${skin.id}`;
    if (reuse && reuse.key === key) {
      return reuse;
    }
    const ox = PARALLAX_OVERSCAN_X;
    const oy = PARALLAX_OVERSCAN_Y;
    const lw = width + ox * 2;
    const lh = height + oy * 2;
    const farTop = Math.max(0, Math.floor(height * 0.44) - oy);
    const farH = height + oy * 2 - farTop;
    const nearTop = Math.max(0, Math.floor(height * 0.68) - oy);
    const nearH = height + oy * 2 - nearTop;

    const sky = reuse?.sky ?? this.createOffscreen(width, height);
    const far = reuse?.far ?? this.createOffscreen(lw, farH);
    const mid = reuse?.mid ?? this.createOffscreen(lw, lh);
    const near = reuse?.near ?? this.createOffscreen(lw, nearH);

    if (sky.width !== width || sky.height !== height) {
      sky.width = width;
      sky.height = height;
    }
    if (far.width !== lw || far.height !== farH) {
      far.width = lw;
      far.height = farH;
    }
    if (mid.width !== lw || mid.height !== lh) {
      mid.width = lw;
      mid.height = lh;
    }
    if (near.width !== lw || near.height !== nearH) {
      near.width = lw;
      near.height = nearH;
    }

    const skyCtx = sky.getContext('2d', { alpha: false }) ?? sky.getContext('2d');
    const farCtx = far.getContext('2d');
    const midCtx = mid.getContext('2d');
    const nearCtx = near.getContext('2d');

    if (skyCtx) {
      this.drawSkyLayer(skyCtx, width, height, skin);
    }
    if (farCtx) {
      farCtx.clearRect(0, 0, lw, farH);
      farCtx.save();
      farCtx.translate(ox, oy - farTop);
      this.drawFarLayer(farCtx, width, height, skin);
      farCtx.restore();
    }
    if (midCtx) {
      midCtx.clearRect(0, 0, lw, lh);
      midCtx.save();
      midCtx.translate(ox, oy);
      this.drawMidLayer(midCtx, width, height, skin);
      midCtx.restore();
    }
    if (nearCtx) {
      nearCtx.clearRect(0, 0, lw, nearH);
      nearCtx.save();
      nearCtx.translate(ox, oy - nearTop);
      this.drawNearLayer(nearCtx, width, height, skin);
      nearCtx.restore();
    }

    return {
      key,
      width,
      height,
      overscanX: ox,
      overscanY: oy,
      farTop,
      nearTop,
      sky,
      far,
      mid,
      near,
    };
  }

  private ensureLayerCaches(
    width: number,
    height: number,
    skin: SkinConfig,
    prevSkin: SkinConfig | null
  ): { curr: ParallaxCacheSet | null; prev: ParallaxCacheSet | null } {
    const currKey = `${width}x${height}:${skin.id}`;
    const prevKey = prevSkin ? `${width}x${height}:${prevSkin.id}` : null;

    if (this.currLayerCache?.key !== currKey) {
      if (this.prevLayerCache && this.prevLayerCache.key === currKey) {
        const tmp = this.currLayerCache;
        this.currLayerCache = this.prevLayerCache;
        this.prevLayerCache = tmp;
      } else if (prevKey && this.currLayerCache?.key === prevKey) {
        const spare = this.prevLayerCache;
        this.prevLayerCache = this.currLayerCache;
        this.currLayerCache = this.buildLayerCache(width, height, skin, spare);
      } else {
        this.currLayerCache = this.buildLayerCache(
          width,
          height,
          skin,
          this.currLayerCache
        );
      }
    }

    if (prevSkin && prevKey && this.prevLayerCache?.key !== prevKey) {
      this.prevLayerCache = this.buildLayerCache(
        width,
        height,
        prevSkin,
        this.prevLayerCache
      );
    }

    return { curr: this.currLayerCache, prev: prevSkin ? this.prevLayerCache : null };
  }

  private drawParallaxSet(
    ctx: CanvasRenderingContext2D,
    layers: ParallaxCacheSet,
    alpha: number
  ): void {
    const px = this.parallaxX;
    const py = this.parallaxY;
    const ox = layers.overscanX;
    const oy = layers.overscanY;

    ctx.globalAlpha = alpha;
    ctx.drawImage(layers.sky, 0, 0, layers.width, layers.height);
    ctx.drawImage(layers.far, -ox - px * 0.34, layers.farTop - oy - py * 0.28);
    ctx.drawImage(layers.mid, -ox - px * 0.72, -oy - py * 0.62);
    ctx.drawImage(layers.near, -ox - px * 1.18, layers.nearTop - oy - py * 0.96);
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    params: {
      skin: SkinConfig;
      prevSkin: SkinConfig | null;
      transitionAlpha: number;
      timeSec: number;
      beatPhase: number;
      timelineNorm: number;
      primaryBoard: BoardState | null;
      secondaryBoard: BoardState | null;
      isTitleScreen: boolean;
      secondaryLabel?: string;
      audioSpectrum?: { subBass: number; mid: number; high: number; bands?: number[] };
      encoreIntensity?: number;
    }
  ): void {
    const {
      skin,
      prevSkin,
      transitionAlpha,
      timeSec,
      beatPhase,
      timelineNorm,
      primaryBoard,
      secondaryBoard,
      isTitleScreen,
      secondaryLabel,
      audioSpectrum = { subBass: 0, mid: 0, high: 0 },
      encoreIntensity = 0,
    } = params;

    if (this.lastRenderTimeSec > 0 && timeSec > this.lastRenderTimeSec) {
      this.lastFrameDt = Math.min(0.05, timeSec - this.lastRenderTimeSec);
    }
    this.lastRenderTimeSec = timeSec;

    const primaryCols = primaryBoard
      ? primaryBoard.grid[0]?.length ?? primaryBoard.cols ?? BOARD_COLS
      : BOARD_COLS;
    const primaryRows = primaryBoard
      ? primaryBoard.grid.length ?? primaryBoard.rows ?? BOARD_ROWS
      : BOARD_ROWS;

    if (this.reducedMotion) {
      this.targetParallaxX = 0;
      this.targetParallaxY = 0;
    } else if (!isTitleScreen && primaryBoard?.activePiece) {
      const piece = primaryBoard.activePiece;
      const moveNormX = ((piece.x + 1) / primaryCols - 0.5) * 2;
      const moveNormY = Math.max(-0.4, Math.min(1, piece.y / primaryRows - 0.35));
      this.targetParallaxX =
        moveNormX * 26 + this.pointerNormX * 12 + Math.sin(timeSec * 0.16) * 5;
      this.targetParallaxY =
        moveNormY * 10 + this.pointerNormY * 5 + Math.cos(timeSec * 0.12) * 3;
    } else {
      this.targetParallaxX =
        this.pointerNormX * 26 + Math.sin(timeSec * 0.18) * 14;
      this.targetParallaxY =
        this.pointerNormY * 12 + Math.cos(timeSec * 0.14) * 5;
    }

    ctx.save();

    const { curr, prev } = this.ensureLayerCaches(width, height, skin, prevSkin);
    const easedTrans =
      transitionAlpha <= 0
        ? 0
        : transitionAlpha >= 1
        ? 1
        : 0.5 - 0.5 * Math.cos(Math.PI * transitionAlpha);
    if (prev && curr && easedTrans > 0 && easedTrans < 1) {
      this.drawParallaxSet(ctx, prev, 1);
      this.drawParallaxSet(ctx, curr, easedTrans);
      ctx.globalAlpha = 1;
    } else if (curr) {
      this.drawParallaxSet(ctx, curr, 1);
      ctx.globalAlpha = 1;
    }

    this.drawDynamicAmbient(
      ctx,
      width,
      height,
      skin,
      timeSec,
      beatPhase,
      isTitleScreen,
      audioSpectrum,
      encoreIntensity
    );

    if (!isTitleScreen && primaryBoard) {
      const shiftEase =
        this.shiftAnimT > 0 ? Math.pow(this.shiftAnimT, 2.2) : 0;
      const shiftDx = this.shiftFromX * shiftEase;
      const shiftDy = this.shiftFromY * shiftEase;
      const shiftScale = 1 + (this.shiftScaleFrom - 1) * shiftEase;

      const rotProgress = 1 - this.rotateAnimT;
      const rotPivotNorm = Math.min(1, rotProgress / 0.62);
      const rotEase =
        rotPivotNorm <= 0
          ? 0
          : rotPivotNorm >= 1
          ? 1
          : 1 - Math.pow(1 - rotPivotNorm, 3);
      const rotRemainingAngle =
        this.rotateAnimT > 0
          ? (this.rotateAnimDir === 'cw' ? -Math.PI / 2 : Math.PI / 2) * (1 - rotEase)
          : 0;
      const applyRotateTransform = (rect: BoardViewportRect) => {
        if (this.rotateAnimT <= 0 || Math.abs(rotRemainingAngle) < 0.001) return;
        const cx = rect.x + rect.width * 0.5;
        const cy = rect.y + rect.height * 0.5;
        const startScale =
          this.rotateFromCellSize && rect.cellSize > 0
            ? this.rotateFromCellSize / rect.cellSize
            : 1;
        const scale = startScale + (1 - startScale) * rotEase;
        ctx.translate(cx, cy);
        ctx.rotate(rotRemainingAngle);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      };

      const isPortrait = height > width;
      const isCompactLandscape = !isPortrait && (height <= 560 || width < 980);

      if (secondaryBoard) {
        const secCols = secondaryBoard.grid[0]?.length ?? secondaryBoard.cols ?? BOARD_COLS;
        const secRows = secondaryBoard.grid.length ?? secondaryBoard.rows ?? BOARD_ROWS;
        const headerReserve = isCompactLandscape ? 58 : 88;
        const bottomMargin = isPortrait ? 148 : isCompactLandscape ? 16 : 58;
        const sidePad = Math.max(16, width * 0.03);
        const gap = Math.max(16, width * 0.03);
        const availW = isPortrait
          ? width - sidePad * 2
          : (width - sidePad * 2 - gap) / 2;
        const availH = isPortrait
          ? (height - headerReserve - bottomMargin - gap) / 2
          : Math.max(180, height - headerReserve - bottomMargin);
        const cellSize = Math.floor(
          Math.min(availW / Math.max(primaryCols, secCols), availH / (Math.max(primaryRows, secRows) + 2.28))
        );
        const boardW = cellSize * primaryCols;
        const boardH = cellSize * primaryRows;
        if (isPortrait) {
          const startX = Math.floor((width - boardW) / 2);
          const startY = Math.floor(headerReserve + cellSize * 1.95);
          this.lastPrimaryRect = { x: startX, y: startY, width: boardW, height: boardH, cellSize };
          this.lastSecondaryRect = {
            x: startX,
            y: startY + boardH + cellSize * 2.1 + 14,
            width: boardW,
            height: boardH,
            cellSize,
          };
        } else {
          const totalW = boardW * 2 + gap;
          const startX = Math.floor((width - totalW) / 2);
          const startY = Math.floor(
            headerReserve +
              cellSize * 2.08 +
              (availH - (primaryRows + 2.28) * cellSize) / 2
          );
          this.lastPrimaryRect = { x: startX, y: startY, width: boardW, height: boardH, cellSize };
          this.lastSecondaryRect = {
            x: startX + boardW + gap,
            y: startY,
            width: boardW,
            height: boardH,
            cellSize,
          };
        }

        ctx.save();
        if (shiftEase > 0.002) {
          ctx.translate(width / 2 + shiftDx, height / 2 + shiftDy);
          ctx.scale(shiftScale, shiftScale);
          ctx.translate(-width / 2, -height / 2);
        }
        if (!this.reducedMotion && (this.boardShake > 0.05 || this.boardZoomKick > 0.0005)) {
          const sx = Math.sin(timeSec * 58) * this.boardShake * 0.65;
          const sy = Math.cos(timeSec * 47) * this.boardShake * 0.5;
          const zoom = 1 + this.boardZoomKick * 0.7;
          ctx.translate(width * 0.5 + sx, height * 0.5 + sy);
          ctx.scale(zoom, zoom);
          ctx.translate(-width * 0.5, -height * 0.5);
        }

        ctx.save();
        applyRotateTransform(this.lastPrimaryRect);
        this.drawBoard(
          ctx,
          this.lastPrimaryRect,
          primaryBoard,
          skin,
          timelineNorm,
          beatPhase,
          timeSec,
          'PLAYER 1',
          audioSpectrum,
          0
        );
        ctx.restore();

        ctx.save();
        applyRotateTransform(this.lastSecondaryRect);
        this.drawBoard(
          ctx,
          this.lastSecondaryRect,
          secondaryBoard,
          skin,
          timelineNorm,
          beatPhase,
          timeSec,
          secondaryLabel ?? 'CPU',
          audioSpectrum,
          1
        );
        ctx.restore();
        ctx.restore();
      } else {
        const isDesktopWide = width >= 1024 && height > 560;
        const headerReserve = isDesktopWide ? 44 : isPortrait ? 74 : 48;
        const bottomMargin = isDesktopWide ? 76 : isPortrait ? 148 : 22;
        const leftReserve = isDesktopWide ? 168 : isCompactLandscape ? 128 : 14;
        const rightReserve = isDesktopWide ? 24 : isCompactLandscape ? 128 : 14;
        const availW = Math.max(220, width - leftReserve - rightReserve);
        const availH = Math.max(180, height - headerReserve - bottomMargin);
        const cellSize = Math.floor(
          Math.min(availW / primaryCols, availH / (primaryRows + 2.22))
        );
        const boardW = cellSize * primaryCols;
        const boardH = cellSize * primaryRows;
        const startX = isDesktopWide
          ? Math.floor(leftReserve + (availW - boardW) * 0.5)
          : Math.floor((width - boardW) / 2);
        const slackBias = isPortrait ? 0.38 : 0.42;
        const startY = Math.floor(
          headerReserve +
            cellSize * 2.04 +
            (availH - (primaryRows + 2.22) * cellSize) * slackBias
        );

        this.lastPrimaryRect = {
          x: startX,
          y: startY,
          width: boardW,
          height: boardH,
          cellSize,
        };
        this.lastSecondaryRect = null;

        ctx.save();
        const pivotCx = startX + boardW * 0.5;
        const pivotCy = startY + boardH * 0.5;
        if (shiftEase > 0.002) {
          ctx.translate(pivotCx + shiftDx, pivotCy + shiftDy);
          ctx.scale(shiftScale, shiftScale);
          ctx.translate(-pivotCx, -pivotCy);
        }
        const telegraphTremor =
          !this.reducedMotion && primaryBoard.upcomingShift && timelineNorm >= 0.35
            ? Math.sin(timeSec * 44) * 1.15
            : 0;
        const combinedTremor =
          (!this.reducedMotion ? this.boardTremor * 2.4 : 0) +
          (!this.reducedMotion ? this.boardShake : 0);
        if (combinedTremor > 0.05 || telegraphTremor !== 0 || this.boardZoomKick > 0.0005) {
          const sx = Math.sin(timeSec * 61) * combinedTremor + telegraphTremor;
          const sy = Math.cos(timeSec * 53) * combinedTremor * 0.72;
          const zoom = 1 + (this.reducedMotion ? 0 : this.boardZoomKick);
          ctx.translate(pivotCx + sx, pivotCy + sy);
          ctx.scale(zoom, zoom);
          ctx.translate(-pivotCx, -pivotCy);
        }
        applyRotateTransform(this.lastPrimaryRect);

        this.drawBoard(
          ctx,
          this.lastPrimaryRect,
          primaryBoard,
          skin,
          timelineNorm,
          beatPhase,
          timeSec,
          undefined,
          audioSpectrum,
          0
        );

        if (shiftEase > 0.04) {
          ctx.save();
          ctx.strokeStyle = skin.palette.hudAccent;
          ctx.globalAlpha = shiftEase * 0.65;
          ctx.lineWidth = 2.5;
          const pad = 12 + shiftEase * 10;
          this.roundRect(ctx, startX - pad, startY - pad, boardW + pad * 2, boardH + pad * 2, 16);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }

      this.drawSweepFlares(ctx);
      this.drawClearRings(ctx);
      this.drawParticles(ctx);
      this.drawPopups(ctx);
    }

    ctx.restore();
  }

  private drawDynamicAmbient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig,
    timeSec: number,
    beatPhase: number,
    isTitleScreen: boolean,
    audioSpectrum: { subBass: number; mid: number; high: number; bands?: number[] } = {
      subBass: 0,
      mid: 0,
      high: 0,
    },
    encoreIntensity: number = 0
  ): void {
    const horizonY = height * 0.76 - this.parallaxY * 0.6;
    const beatPulse = Math.pow(1 - beatPhase, 2.6);
    const { subBass, mid, high, bands } = audioSpectrum;
    const { palette, theme } = skin;

    ctx.save();

    if (isTitleScreen) {
      const mandalaX = width * 0.62 - this.parallaxX * 0.38;
      const mandalaY = height * 0.46 - this.parallaxY * 0.28;
      const baseOrbR =
        Math.min(width, height) *
        (0.28 + beatPulse * 0.02 + subBass * 0.036 + this.sweepBloom * 0.045);

      const glowSprite = this.getMandalaGlowSprite();
      if (glowSprite) {
        const glowR = baseOrbR * 1.38;
        ctx.drawImage(glowSprite, mandalaX - glowR, mandalaY - glowR, glowR * 2, glowR * 2);
      }

      ctx.fillStyle = palette.architectureLight;
      ctx.globalAlpha = 0.045 + beatPulse * 0.03 + mid * 0.04 + this.sweepBloom * 0.05;
      ctx.beginPath();
      ctx.arc(mandalaX, mandalaY, baseOrbR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.architectureMid;
      ctx.globalAlpha = 0.035 + high * 0.035;
      ctx.beginPath();
      ctx.arc(mandalaX, mandalaY, baseOrbR * (0.72 + subBass * 0.04), 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + timeSec * 0.04;
        const orbitR = baseOrbR * (1.14 + (i % 2 === 0 ? mid : high) * 0.06);
        const sx = mandalaX + Math.cos(ang) * orbitR;
        const sy = mandalaY + Math.sin(ang) * orbitR;
        const shapeR = i % 3 === 0 ? 5.5 + beatPulse * 2.5 : 3.2 + subBass * 2;
        ctx.fillStyle = i % 2 === 0 ? palette.architectureLight : palette.blockA.highlight;
        ctx.globalAlpha = i % 3 === 0 ? 0.14 + beatPulse * 0.09 : 0.08 + high * 0.08;
        if (i % 2 === 0) {
          this.drawDiamond(ctx, sx, sy, shapeR);
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, shapeR * 0.78, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.fillStyle = palette.horizonMist;
    for (let i = 0; i < 4; i++) {
      const drift = ((timeSec * (0.011 + i * 0.004) + i * 0.27) % 1.35) - 0.18;
      const cx =
        drift * width -
        this.parallaxX * (0.3 + i * 0.1) -
        this.moveRippleShift * (0.65 + i * 0.22);
      const cy = height * (0.14 + i * 0.13) + Math.sin(timeSec * 0.4 + i) * 7;
      const rw = width * (0.14 + (i % 3) * 0.045);
      const rh = 16 + i * 5;
      ctx.globalAlpha = 0.075 + beatPulse * 0.025 + mid * 0.025;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const sunX = width * 0.72 - this.parallaxX * 0.22;
    const sunY = height * 0.24 - this.parallaxY * 0.16;
    const shaftTilt = Math.sin(timeSec * 0.22) * 24 - this.parallaxX * 0.45;
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const spreadX = (sIdx === 0 ? -width * 0.19 : -width * 0.03) + shaftTilt;
      const shaftGrad = ctx.createLinearGradient(sunX, sunY, sunX + spreadX, horizonY);
      shaftGrad.addColorStop(0, palette.architectureLight);
      shaftGrad.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.fillStyle = shaftGrad;
      ctx.globalAlpha = (sIdx === 0 ? 0.048 : 0.034) + beatPulse * 0.025 + this.sweepBloom * 0.04;
      ctx.beginPath();
      ctx.moveTo(sunX - 18, sunY);
      ctx.lineTo(sunX + 18, sunY);
      ctx.lineTo(sunX + spreadX + width * (0.1 + sIdx * 0.05), horizonY + 12);
      ctx.lineTo(sunX + spreadX - width * (0.08 + sIdx * 0.04), horizonY + 12);
      ctx.closePath();
      ctx.fill();
    }

    const pulseR =
      Math.min(width, height) * (0.1 + beatPulse * 0.024 + subBass * 0.022);
    ctx.fillStyle = palette.architectureLight;
    ctx.globalAlpha = 0.08 + beatPulse * 0.045 + mid * 0.055;
    ctx.beginPath();
    ctx.arc(sunX, sunY, pulseR * 1.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.14 + beatPulse * 0.065 + high * 0.065;
    ctx.beginPath();
    ctx.arc(sunX, sunY, pulseR * 0.92, 0, Math.PI * 2);
    ctx.fill();

    {
      const rippleX =
        width * 0.5 +
        this.pointerNormX * width * 0.22 +
        this.moveRippleShift * 3.5 -
        this.parallaxX * 0.5;
      const rippleY = horizonY + (height - horizonY) * (0.42 + this.pointerNormY * 0.14);
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const wSpan = (48 + rIdx * 36) * (1 + beatPulse * 0.18 + this.sweepBloom * 0.25);
        const ry = rippleY + rIdx * 13 + Math.sin(timeSec * 1.7 + rIdx) * 2.5;
        ctx.fillStyle = rIdx === 0 ? palette.squareHighlight : palette.architectureLight;
        ctx.globalAlpha = (0.12 - rIdx * 0.025) + beatPulse * 0.05 + this.sweepBloom * 0.09;
        ctx.beginPath();
        ctx.ellipse(
          rippleX + Math.sin(timeSec * 1.3 + rIdx * 1.6) * 14,
          ry,
          wSpan,
          3.2,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    if (
      theme === 'monument_valley' ||
      theme === 'old_mans_journey' ||
      theme === 'sennaar' ||
      theme === 'hyper_light' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic'
    ) {
      for (let i = 0; i < 6; i++) {
        const ry = horizonY + 14 + i * ((height - horizonY) / 6.2);
        const offset =
          Math.sin(timeSec * 0.65 + i * 1.4) * 34 -
          this.parallaxX * 0.72 -
          this.moveRippleShift * (0.4 + i * 0.12);
        const pillW = width * (0.14 + (i % 3) * 0.05) + beatPulse * 12;
        const pillH = 6 + (i % 2) * 4;
        const px = width * (0.16 + ((i * 0.19) % 0.68)) + offset;
        ctx.fillStyle = i % 2 === 0 ? palette.architectureLight : palette.blockB.highlight;
        ctx.globalAlpha = 0.11 + (i % 2) * 0.04 + beatPulse * 0.045;
        ctx.beginPath();
        ctx.ellipse(px, ry, pillW * 0.5, pillH, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'ochre_skyline') {
      for (let i = 0; i < 5; i++) {
        const ry = horizonY + 18 + i * 16;
        const sway = Math.sin(timeSec * 1.1 + i * 1.3) * 22 - this.parallaxX * 0.68;
        const px = width * (0.12 + i * 0.19) + sway;
        ctx.fillStyle = i % 2 === 0 ? palette.blockA.highlight : palette.architectureLight;
        ctx.globalAlpha = 0.16 + beatPulse * 0.08;
        ctx.beginPath();
        ctx.ellipse(px, ry, 42 + beatPulse * 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'gorogoa' || theme === 'transistor' || theme === 'sayonara') {
      if (isTitleScreen) {
        const cx = width * 0.5 - this.parallaxX * 0.4;
        const cy = height * 0.45 - this.parallaxY * 0.3;
        const radius = Math.min(width, height) * 0.34;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timeSec * 0.045);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = Math.cos(a) * radius;
          const py = Math.sin(a) * radius;
          ctx.fillStyle = k % 2 === 0 ? palette.architectureLight : palette.blockA.highlight;
          ctx.globalAlpha = 0.11 + beatPulse * 0.06;
          if (k % 2 === 0) {
            this.drawDiamond(ctx, px, py, 16 + beatPulse * 4);
          } else {
            ctx.beginPath();
            ctx.arc(px, py, 12 + mid * 8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      } else {
        for (let side = 0; side < 2; side++) {
          const cx = (side === 0 ? width * 0.1 : width * 0.9) - this.parallaxX * 0.45;
          const cy = height * 0.46 - this.parallaxY * 0.3;
          ctx.fillStyle = side === 0 ? palette.architectureLight : palette.blockA.highlight;
          ctx.globalAlpha = 0.14 + beatPulse * 0.06;
          this.drawDiamond(ctx, cx, cy, 18 + beatPulse * 4);
        }
      }
    } else if (theme === 'indigo_risograph') {
      for (let idx = 0; idx < 2; idx++) {
        const rx = (idx === 0 ? width * 0.13 : width * 0.87) - this.parallaxX * 0.58;
        const ry = (idx === 0 ? height * 0.34 : height * 0.64) - this.parallaxY * 0.45;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(timeSec * 0.22 * (idx === 0 ? 1 : -1));
        ctx.strokeStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.globalAlpha = 0.28 + beatPulse * 0.12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 26 + subBass * 8, 0, Math.PI * 2);
        ctx.moveTo(-36, 0);
        ctx.lineTo(36, 0);
        ctx.moveTo(0, -36);
        ctx.lineTo(0, 36);
        ctx.stroke();
        ctx.restore();
      }
    } else if (theme === 'gris') {
      for (let idx = 0; idx < 3; idx++) {
        if (!isTitleScreen && idx === 1) continue;
        const rx = idx === 0 ? 0.14 : idx === 1 ? 0.5 : 0.86;
        const bx = width * rx + Math.sin(timeSec * 0.35 + idx * 2) * 26 - this.parallaxX * 0.5;
        const by = height * (0.34 + (idx % 2) * 0.18) + Math.cos(timeSec * 0.28 + idx) * 18;
        const br = 76 + beatPulse * 18 + subBass * 22;
        ctx.fillStyle = idx === 0 ? palette.blockA.highlight : idx === 1 ? palette.blockB.highlight : palette.architectureMid;
        ctx.globalAlpha = 0.13 + mid * 0.08;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'fez') {
      for (let idx = 0; idx < 4; idx++) {
        const ptX = idx === 0 ? width * 0.13 : idx === 1 ? width * 0.87 : idx === 2 ? width * 0.11 : width * 0.89;
        const ptY = idx === 0 ? height * 0.27 : idx === 1 ? height * 0.23 : idx === 2 ? height * 0.56 : height * 0.55;
        const cx = ptX - this.parallaxX * 0.65;
        const cy = ptY + Math.sin(timeSec * 1.4 + idx * 1.5) * 9 - this.parallaxY * 0.52;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timeSec * 0.55 * (idx % 2 === 0 ? 1 : -1));
        ctx.fillStyle = idx % 2 === 0 ? palette.blockB.highlight : palette.blockA.highlight;
        ctx.globalAlpha = 0.34 + beatPulse * 0.16;
        const s = 14 + beatPulse * 4;
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
        ctx.strokeStyle = palette.architectureLight;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-s * 0.5, -s * 0.5, s, s);
        ctx.restore();
      }
    } else if (theme === 'papetura') {
      for (let idx = 0; idx < 2; idx++) {
        const lx = (idx === 0 ? width * 0.11 : width * 0.89) - this.parallaxX * 0.6;
        const ly = (idx === 0 ? height * 0.45 : height * 0.42) + Math.sin(timeSec * 1.2 + idx * 2.1) * 8 - this.parallaxY * 0.5;
        const flicker = 0.16 + 0.06 * Math.sin(timeSec * 5.2 + idx * 1.9) + beatPulse * 0.1;
        const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 78);
        g.addColorStop(0, 'rgba(255, 224, 160, 0.55)');
        g.addColorStop(1, 'rgba(255, 224, 160, 0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = flicker * 2.4;
        ctx.beginPath();
        ctx.arc(lx, ly, 78, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'hohokum') {
      for (let i = 0; i < 8; i++) {
        const driftX = ((timeSec * (28 + i * 5) + i * 160) % (width + 180)) - 90 - this.parallaxX * 0.6;
        const driftY = height * (0.2 + (i % 4) * 0.15) + Math.sin(timeSec * 1.7 + i * 1.1) * 18;
        ctx.fillStyle = i % 3 === 0 ? palette.blockA.fill : i % 3 === 1 ? palette.blockB.fill : palette.blockC.fill;
        ctx.globalAlpha = 0.24 + beatPulse * 0.12;
        ctx.beginPath();
        ctx.arc(driftX, driftY, 7 + (i % 3) * 3 + subBass * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'kentucky_rz') {
      for (let idx = 0; idx < 2; idx++) {
        const px = (idx === 0 ? width * 0.12 : width * 0.88) - this.parallaxX * 0.62;
        const topY = horizonY - 178 - this.parallaxY * 0.52;
        const flicker = 0.14 + 0.05 * Math.sin(timeSec * 8.4 + idx * 3.1) + beatPulse * 0.08;
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = flicker;
        ctx.beginPath();
        ctx.moveTo(px - 6, topY);
        ctx.lineTo(px + 6, topY);
        ctx.lineTo(px + 72, horizonY + 12);
        ctx.lineTo(px - 72, horizonY + 12);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === 'abzu') {
      for (let i = 0; i < 3; i++) {
        const base =
          width * (0.16 + i * 0.27) +
          Math.sin(timeSec * 0.45 + i * 2) * 26 -
          this.parallaxX * 0.55;
        ctx.fillStyle = 'rgba(250, 246, 238, 0.09)';
        ctx.globalAlpha = 0.7 + beatPulse * 0.25;
        ctx.beginPath();
        ctx.moveTo(base, 0);
        ctx.lineTo(base + 54, 0);
        ctx.lineTo(base + 180, height);
        ctx.lineTo(base + 30, height);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === 'spiritfarer') {
      for (let idx = 0; idx < 4; idx++) {
        const lx = width * (idx === 0 ? 0.1 : idx === 1 ? 0.18 : idx === 2 ? 0.84 : 0.91);
        const ly = height * (idx === 0 ? 0.25 : idx === 1 ? 0.36 : idx === 2 ? 0.24 : 0.38) - this.parallaxY * 0.62;
        const sway = Math.sin(timeSec * 1.1 + idx * 1.7) * 5 - this.parallaxX * 0.62;
        ctx.fillStyle = palette.blockA.highlight;
        ctx.globalAlpha = 0.14 + beatPulse * 0.1;
        ctx.beginPath();
        ctx.arc(lx + sway, ly + 14, 24 + beatPulse * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'machinarium') {
      const drawTinyGear = (gx: number, gy: number, gr: number, teeth: number, rot: number) => {
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(rot);
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const ang = (i / (teeth * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? gr : gr * 0.84;
          if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
          else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      drawTinyGear(width * 0.1 - this.parallaxX * 0.62, height * 0.72 - this.parallaxY * 0.52, 118, 12, timeSec * 0.08);
      drawTinyGear(width * 0.9 - this.parallaxX * 0.62, height * 0.7 - this.parallaxY * 0.52, 128, 14, -timeSec * 0.07);
    } else if (theme === 'ori' || theme === 'aurora_prism') {
      for (let i = 0; i < 7; i++) {
        const fx =
          width * (0.07 + (i % 2 === 0 ? i * 0.032 : 0.78 + i * 0.024)) -
          this.parallaxX * 0.9;
        const fy =
          height * (0.24 + i * 0.095) +
          Math.sin(timeSec * 1.2 + i * 2) * 14 -
          this.parallaxY * 0.7;
        const glow = 0.13 + 0.12 * Math.sin(timeSec * 2.4 + i);
        ctx.fillStyle = i % 2 === 0 ? palette.architectureLight : palette.blockA.highlight;
        ctx.globalAlpha = Math.max(0.06, glow);
        ctx.beginPath();
        ctx.arc(fx, fy, 13 + beatPulse * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'altos_odyssey' || theme === 'amber_encaustic') {
      for (let i = 0; i < 4; i++) {
        const by = Math.sin(timeSec * 0.65 + i * 1.5) * 9 - this.parallaxY * 0.4;
        const bx = Math.cos(timeSec * 0.32 + i) * 12 - this.parallaxX * 0.45;
        ctx.fillStyle = i % 2 === 0 ? palette.architectureShadow : palette.blockB.fill;
        ctx.globalAlpha = 0.18 + beatPulse * 0.06;
        ctx.beginPath();
        ctx.arc(width * (0.1 + i * 0.25) + bx, height * (0.24 + (i % 2) * 0.16) + by, 12 + i * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'journey' || theme === 'sable' || theme === 'celadon_fresco') {
      ctx.fillStyle = palette.architectureLight;
      for (let i = 0; i < 5; i++) {
        const ry = horizonY - 26 + i * 22;
        const drift =
          ((timeSec * (36 + i * 12) + i * 240) % (width + 260)) -
          130 -
          this.parallaxX * 0.65;
        ctx.globalAlpha = 0.12 + beatPulse * 0.04;
        ctx.beginPath();
        ctx.ellipse(drift + 55, ry, 52 + i * 8, 5.5, -0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'cityscape_deco') {
      for (let idx = 0; idx < 2; idx++) {
        const baseX = (idx === 0 ? width * 0.13 : width * 0.87) - this.parallaxX * 0.6;
        const baseY = horizonY - 40 - this.parallaxY * 0.5;
        const angle = -Math.PI * 0.5 + Math.sin(timeSec * 0.65 + idx * 1.8) * 0.42;
        const spread = 0.14;
        const len = height * 0.72;
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.12 + beatPulse * 0.07;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(baseX + Math.cos(angle - spread) * len, baseY + Math.sin(angle - spread) * len);
        ctx.lineTo(baseX + Math.cos(angle + spread) * len, baseY + Math.sin(angle + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === 'noland_target' || theme === 'artisan_blocks') {
      for (let idx = 0; idx < 2; idx++) {
        const px = (idx === 0 ? width * 0.12 : width * 0.88) - this.parallaxX * 0.62;
        const py = height * 0.46 - this.parallaxY * 0.52;
        ctx.fillStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.globalAlpha = 0.11 + beatPulse * 0.06;
        ctx.beginPath();
        ctx.arc(px, py, 56 + beatPulse * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = idx === 0 ? palette.blockB.highlight : palette.blockA.highlight;
        ctx.globalAlpha = 0.12 + high * 0.07;
        ctx.beginPath();
        ctx.arc(px, py, 28 + mid * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'limbo_inside') {
      const swayX = width * 0.5 + Math.sin(timeSec * 0.32) * 32 - this.parallaxX * 0.4;
      const spot = ctx.createRadialGradient(swayX, 0, 20, swayX, height * 0.65, width * 0.36);
      spot.addColorStop(0, 'rgba(250, 246, 238, 0.14)');
      spot.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.fillStyle = spot;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, width, height);
    } else if (theme === 'sumi_bamboo') {
      for (let i = 0; i < 6; i++) {
        const sideLeft = i < 3;
        const bx = width * (sideLeft ? 0.06 + i * 0.04 : 0.84 + (i - 3) * 0.04) - this.parallaxX * 0.72;
        const by = height * (0.24 + (i % 3) * 0.16) - this.parallaxY * 0.5;
        const sway = Math.sin(timeSec * 1.15 + i * 0.9) * 0.18;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(sway + (sideLeft ? 0.35 : -0.35));
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.24 + mid * 0.1;
        for (let leaf = 0; leaf < 3; leaf++) {
          ctx.save();
          ctx.rotate((leaf - 1) * 0.38);
          ctx.beginPath();
          ctx.ellipse(22, 0, 24, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    } else if (theme === 'cubist_atelier') {
      for (let idx = 0; idx < 2; idx++) {
        const cx = (idx === 0 ? width * 0.13 : width * 0.87) - this.parallaxX * 0.58;
        const cy = (idx === 0 ? height * 0.42 : height * 0.44) - this.parallaxY * 0.48;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timeSec * 0.12 * (idx === 0 ? 1 : -1));
        ctx.fillStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.globalAlpha = 0.2 + beatPulse * 0.08;
        ctx.fillRect(-38, -52, 54, 88);
        ctx.rotate(0.45);
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(-24, -40, 62, 58);
        ctx.strokeStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1.2;
        for (let s = -16; s <= 16; s += 8) {
          ctx.beginPath();
          ctx.moveTo(s, -68);
          ctx.lineTo(s, 68);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (theme === 'detroit_visor') {
      const scanY = ((timeSec * 85) % (height * 0.86)) + height * 0.07;
      const scanGrad = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
      scanGrad.addColorStop(0, 'rgba(232, 74, 95, 0)');
      scanGrad.addColorStop(0.5, 'rgba(232, 74, 95, 0.24)');
      scanGrad.addColorStop(1, 'rgba(232, 74, 95, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 18, width, 36);

      for (let idx = 0; idx < 2; idx++) {
        const px = (idx === 0 ? width * 0.11 : width * 0.89) - this.parallaxX * 0.56;
        const py = height * (idx === 0 ? 0.34 : 0.62) - this.parallaxY * 0.45;
        ctx.strokeStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.28 + beatPulse * 0.18;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(px, py, 28 + subBass * 8, 0, Math.PI * 2);
        ctx.moveTo(px - 38, py);
        ctx.lineTo(px - 18, py);
        ctx.moveTo(px + 18, py);
        ctx.lineTo(px + 38, py);
        ctx.stroke();
      }
    } else if (theme === 'miami_vice') {
      if (isTitleScreen) {
        for (let i = 0; i < 5; i++) {
          const sy = horizonY + 12 + i * 18;
          const sw = width * (0.28 - i * 0.03) + beatPulse * 18;
          ctx.fillStyle = i % 2 === 0 ? palette.blockA.fill : palette.blockB.fill;
          ctx.globalAlpha = 0.18 + beatPulse * 0.09;
          this.roundRect(ctx, width * 0.5 - sw * 0.5 - this.parallaxX * 0.4, sy, sw, 4, 2);
          ctx.fill();
        }
      }
      for (let idx = 0; idx < 2; idx++) {
        const px = (idx === 0 ? width * 0.12 : width * 0.88) - this.parallaxX * 0.65;
        const py = height * 0.34 - this.parallaxY * 0.5;
        ctx.strokeStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.globalAlpha = 0.25 + beatPulse * 0.14;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(px, py, 32 + Math.sin(timeSec * 2 + idx) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (theme === 'neo_andean') {
      for (let idx = 0; idx < 4; idx++) {
        const px = width * (idx === 0 ? 0.11 : idx === 1 ? 0.89 : idx === 2 ? 0.12 : 0.88) - this.parallaxX * 0.6;
        const py = height * (idx < 2 ? 0.38 : 0.64) - this.parallaxY * 0.48;
        const col = idx === 0 || idx === 3 ? palette.blockA.fill : idx === 1 ? palette.blockB.fill : palette.blockC.fill;
        const scale = 1 + beatPulse * 0.14 + (idx % 2 === 0 ? subBass : mid) * 0.1;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(scale, scale);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.22 + beatPulse * 0.1;
        ctx.fillRect(-10, -28, 20, 56);
        ctx.fillRect(-28, -10, 56, 20);
        ctx.fillRect(-19, -19, 38, 38);
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.34;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (theme === 'neko_sketchbook') {
      for (let cIdx = 0; cIdx < 2; cIdx++) {
        const flip = cIdx === 0 ? 1 : -1;
        const phase = cIdx === 0 ? 0.4 : 2.2;
        const cx = (cIdx === 0 ? width * 0.062 : width * 0.946) - this.parallaxX * 0.62;
        const cy = (cIdx === 0 ? height * 0.72 : height * 0.44) + Math.sin(timeSec * 1.4 + phase) * 4 - this.parallaxY * 0.5;
        const blink = Math.sin(timeSec * 0.9 + phase * 3.1) > 0.92;
        const tailSwing = Math.sin(timeSec * 3.2 + phase) * 0.35;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(flip, 1);
        ctx.globalAlpha = 0.78;

        ctx.save();
        ctx.translate(-22, 22);
        ctx.rotate(tailSwing);
        ctx.strokeStyle = palette.architectureShadow;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-24, -8, -26, -34, -8, -32);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = cIdx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.beginPath();
        ctx.ellipse(0, 14, 24, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -14, 20, 0, Math.PI * 2);
        ctx.fill();
        const earTwitch = Math.sin(timeSec * 4.5 + phase) > 0.85 ? 0.12 : 0;
        ctx.beginPath();
        ctx.moveTo(-16, -24);
        ctx.lineTo(-22, -44 + earTwitch * 18);
        ctx.lineTo(-4, -31);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(16, -24);
        ctx.lineTo(22, -44);
        ctx.lineTo(4, -31);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = palette.architectureShadow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -14, 20, 0, Math.PI * 2);
        ctx.stroke();
        if (blink) {
          ctx.beginPath();
          ctx.moveTo(-10, -16);
          ctx.lineTo(-4, -16);
          ctx.moveTo(4, -16);
          ctx.lineTo(10, -16);
          ctx.stroke();
        } else {
          ctx.fillStyle = palette.architectureShadow;
          this.fillCircle(ctx, -7, -16, 2.5);
          this.fillCircle(ctx, 7, -16, 2.5);
        }
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-11, -10);
        ctx.lineTo(-25, -12);
        ctx.moveTo(-11, -8);
        ctx.lineTo(-24, -6);
        ctx.moveTo(11, -10);
        ctx.lineTo(25, -12);
        ctx.moveTo(11, -8);
        ctx.lineTo(24, -6);
        ctx.stroke();
        ctx.restore();
      }

      const yarnX = width * 0.18 + Math.sin(timeSec * 0.9) * 28 - this.parallaxX * 0.65;
      const yarnY = horizonY - 12 - Math.abs(Math.sin(timeSec * 2.8)) * (14 + beatPulse * 8);
      ctx.fillStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(yarnX, yarnY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.architectureLight;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(yarnX, yarnY, 7, 0.3, 2.6);
      ctx.stroke();
    } else if (theme === 'stained_glass') {
      if (isTitleScreen) {
        const rx = width * 0.5 - this.parallaxX * 0.35;
        const ry = height * 0.44 - this.parallaxY * 0.25;
        const rad = Math.min(width, height) * 0.36;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(timeSec * 0.035);
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2;
          const a1 = ((i + 0.78) / 12) * Math.PI * 2;
          ctx.fillStyle = i % 3 === 0 ? palette.blockA.fill : i % 3 === 1 ? palette.blockB.fill : palette.blockC.fill;
          ctx.globalAlpha = 0.14 + beatPulse * 0.06;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, rad, a0, a1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      } else {
        for (let side = 0; side < 2; side++) {
          const rx = (side === 0 ? width * 0.1 : width * 0.9) - this.parallaxX * 0.4;
          const ry = height * 0.42 - this.parallaxY * 0.25;
          const rad = Math.min(width, height) * 0.12;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(timeSec * 0.035 * (side === 0 ? 1 : -1));
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2;
            const a1 = ((i + 0.72) / 8) * Math.PI * 2;
            ctx.fillStyle = i % 3 === 0 ? palette.blockA.fill : i % 3 === 1 ? palette.blockB.fill : palette.blockC.fill;
            ctx.globalAlpha = 0.16 + beatPulse * 0.06;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, rad, a0, a1);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    } else if (theme === 'constructivist') {
      const cx = width * 0.12 - this.parallaxX * 0.6;
      const cy = height * 0.5 - this.parallaxY * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * 0.22);
      ctx.fillStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.24 + beatPulse * 0.08;
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.fillRect(-10, -68, 20, 26);
      }
      ctx.strokeStyle = palette.architectureShadow;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (theme === 'botanical_herbarium') {
      for (let idx = 0; idx < 2; idx++) {
        const fx = idx === 0 ? width * 0.09 : width * 0.91;
        const sway = Math.sin(timeSec * 1.1 + idx * 1.7) * 0.08;
        ctx.save();
        ctx.translate(fx - this.parallaxX * 0.65, height * 0.72 - this.parallaxY * 0.5);
        ctx.rotate(sway + (idx === 0 ? 0.16 : -0.16));
        ctx.fillStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
        ctx.globalAlpha = 0.22 + mid * 0.08;
        for (let f = 0; f < 5; f++) {
          ctx.beginPath();
          ctx.ellipse(idx === 0 ? 18 : -18, -32 - f * 28, 26 - f * 2, 7, idx === 0 ? -0.35 : 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (theme === 'memphis_milano') {
      for (let i = 0; i < 7; i++) {
        const cx = width * (0.08 + ((i * 0.15) % 0.84)) + Math.sin(timeSec * 1.2 + i) * 16 - this.parallaxX * 0.6;
        const cy = height * (0.24 + ((i * 0.17) % 0.48)) + Math.cos(timeSec * 1.4 + i) * 14 - this.parallaxY * 0.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timeSec * 0.6 + i);
        ctx.fillStyle = i % 3 === 0 ? palette.blockA.fill : i % 3 === 1 ? palette.blockB.fill : palette.blockC.fill;
        ctx.globalAlpha = 0.26 + beatPulse * 0.12;
        if (i % 2 === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, 12 + subBass * 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(13, 10);
          ctx.lineTo(-13, 10);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    {
      const barCount = 20;
      const spanW = width * 0.9;
      const startX = width * 0.05;
      const stepW = spanW / barCount;
      for (let i = 0; i < barCount; i++) {
        const bandIdx = Math.min(9, Math.floor((i / barCount) * 10));
        const liveBand = bands && bands.length > bandIdx ? bands[bandIdx] : 0;
        const synthWave =
          0.2 +
          0.28 *
            Math.pow(
              0.5 + 0.5 * Math.sin(timeSec * (skin.bpm / 60) * Math.PI - i * 0.5),
              2
            );
        const energy = liveBand > 0.02 ? liveBand : synthWave * (0.45 + beatPulse * 0.55);
        const pillH = 6 + energy * (isTitleScreen ? 32 : 24);
        const bx = startX + i * stepW + stepW * 0.22 - this.parallaxX * 0.35;
        const bw = Math.max(6, stepW * 0.52);
        ctx.fillStyle = i % 2 === 0 ? palette.blockA.highlight : palette.architectureLight;
        ctx.globalAlpha = (isTitleScreen ? 0.13 : 0.1) + energy * 0.14;
        this.roundRect(ctx, bx, horizonY - pillH * 0.5, bw, pillH, bw * 0.5);
        ctx.fill();
      }
    }

    if (encoreIntensity > 0.02) {
      ctx.save();
      for (let band = 0; band < 2; band++) {
        const baseY = height * (0.11 + band * 0.09);
        const grad = ctx.createLinearGradient(0, baseY - 26, width, baseY + 34);
        grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
        grad.addColorStop(0.28, band === 0 ? palette.blockA.highlight : palette.blockB.highlight);
        grad.addColorStop(0.68, palette.squareHighlight);
        grad.addColorStop(1, 'rgba(250, 246, 238, 0)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = (0.14 + beatPulse * 0.09) * encoreIntensity;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let sx = 0; sx <= width; sx += 48) {
          const wave = Math.sin(timeSec * (1.2 + band * 0.4) + sx * 0.008 + band * 2) * (16 + subBass * 18);
          ctx.lineTo(sx, baseY + wave);
        }
        ctx.lineTo(width, baseY + 46);
        ctx.lineTo(0, baseY + 46);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    const moteColor =
      theme === 'ori' || theme === 'spiritfarer'
        ? 'rgba(255, 246, 204, 0.55)'
        : theme === 'abzu'
        ? 'rgba(235, 252, 255, 0.45)'
        : 'rgba(250, 246, 238, 0.36)';
    ctx.fillStyle = moteColor;
    ctx.strokeStyle = moteColor;
    for (let i = 0; i < MAX_MOTES; i++) {
      const m = this.motes[i];
      const mx =
        m.x * width +
        Math.sin(timeSec * 0.8 + m.phase) * 16 -
        this.parallaxX * m.depth * 0.8;
      const my = m.y * height - this.parallaxY * m.depth * 0.6;
      ctx.globalAlpha =
        (0.28 + 0.24 * Math.sin(timeSec * 1.4 + m.phase)) * (1 + encoreIntensity * 0.55);
      if (skin.particleShape === 'petal') {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(timeSec * 0.9 + m.phase);
        ctx.beginPath();
        ctx.ellipse(0, 0, m.r * 1.35, m.r * 0.68, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (skin.particleShape === 'bubble') {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, m.r * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      } else if (skin.particleShape === 'spark') {
        this.drawDiamond(ctx, mx, my, m.r * 0.95);
      } else {
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawSkyLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig
  ): void {
    const { palette, theme } = skin;
    const horizonY = height * 0.76;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, palette.skyTop);
    skyGrad.addColorStop(0.44, palette.skyMid);
    skyGrad.addColorStop(0.75, palette.skyBottom);
    skyGrad.addColorStop(1, palette.waterSurface);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    if (isHexColorDark(palette.skyTop)) {
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const sx = (((i * 197 + 43) % 97) / 97) * width;
        const sy = (((i * 113 + 19) % 83) / 100) * (horizonY * 0.72);
        const sr = i % 4 === 0 ? 1.8 : 1.1;
        ctx.fillStyle = i % 3 === 0 ? palette.blockA.highlight : '#faf6ee';
        ctx.globalAlpha = i % 4 === 0 ? 0.55 : 0.34;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const horizBand = ctx.createLinearGradient(0, horizonY - 90, 0, horizonY + 12);
    horizBand.addColorStop(0, 'rgba(250, 246, 238, 0)');
    horizBand.addColorStop(0.78, palette.horizonMist);
    horizBand.addColorStop(1, 'rgba(250, 246, 238, 0)');
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = horizBand;
    ctx.fillRect(0, horizonY - 90, width, 102);
    ctx.restore();

    const hasWater =
      theme === 'monument_valley' ||
      theme === 'sennaar' ||
      theme === 'kentucky_rz' ||
      theme === 'hyper_light' ||
      theme === 'fez' ||
      theme === 'spiritfarer' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'ochre_skyline' ||
      theme === 'detroit_visor' ||
      theme === 'miami_vice' ||
      theme === 'neo_andean' ||
      theme === 'botanical_herbarium' ||
      theme === 'memphis_milano' ||
      theme === 'ghibli_express' ||
      theme === 'ukiyoe_wave' ||
      theme === 'synth_greenhouse' ||
      theme === 'old_mans_journey' ||
      theme === 'abzu';

    if (hasWater) {
      const waterGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      waterGrad.addColorStop(0, palette.waterSurface);
      waterGrad.addColorStop(1, palette.architectureShadow);
      ctx.save();
      ctx.fillStyle = palette.waterSurface;
      ctx.fillRect(0, horizonY, width, height - horizonY);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      const sunX = width * 0.72;
      const specGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      specGrad.addColorStop(0, palette.architectureLight);
      specGrad.addColorStop(0.65, palette.horizonMist);
      specGrad.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.fillStyle = specGrad;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(sunX - 58, horizonY);
      ctx.lineTo(sunX + 58, horizonY);
      ctx.lineTo(sunX + 18, height);
      ctx.lineTo(sunX - 18, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const sunX = width * 0.72;
    const sunY = height * 0.24;
    const sunR = Math.min(width, height) * 0.15;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.25);
    sunGrad.addColorStop(0, 'rgba(255, 252, 246, 0.76)');
    sunGrad.addColorStop(0.45, 'rgba(255, 248, 240, 0.22)');
    sunGrad.addColorStop(1, 'rgba(255, 248, 240, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.25, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFarLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig
  ): void {
    const { palette, theme } = skin;
    const horizonY = height * 0.76;

    ctx.save();
    if (theme === 'sumi_bamboo') {
      ctx.fillStyle = palette.architectureMid;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(-PARALLAX_OVERSCAN_X, height);
      ctx.quadraticCurveTo(width * 0.18, horizonY - 125, width * 0.42, horizonY - 22);
      ctx.quadraticCurveTo(width * 0.72, horizonY - 155, width + PARALLAX_OVERSCAN_X, horizonY - 30);
      ctx.lineTo(width + PARALLAX_OVERSCAN_X, height);
      ctx.closePath();
      ctx.fill();
    } else if (theme === 'ukiyoe_wave') {
      ctx.fillStyle = palette.architectureMid;
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.moveTo(width * 0.34, horizonY);
      ctx.quadraticCurveTo(width * 0.45, horizonY - 40, width * 0.48, horizonY - 108);
      ctx.lineTo(width * 0.52, horizonY - 108);
      ctx.quadraticCurveTo(width * 0.55, horizonY - 40, width * 0.66, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.architectureLight;
      ctx.globalAlpha = 0.74;
      ctx.beginPath();
      ctx.moveTo(width * 0.465, horizonY - 72);
      ctx.lineTo(width * 0.48, horizonY - 108);
      ctx.lineTo(width * 0.52, horizonY - 108);
      ctx.lineTo(width * 0.535, horizonY - 72);
      ctx.lineTo(width * 0.51, horizonY - 62);
      ctx.lineTo(width * 0.49, horizonY - 66);
      ctx.closePath();
      ctx.fill();
    } else if (theme === 'ghibli_express') {
      ctx.fillStyle = palette.architectureLight;
      ctx.globalAlpha = 0.58;
      [
        [width * 0.16, horizonY - 65, 92],
        [width * 0.24, horizonY - 98, 72],
        [width * 0.76, horizonY - 82, 108],
        [width * 0.85, horizonY - 52, 84],
      ].forEach(([cx, cy, r]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (theme === 'space_terminal') {
      ctx.fillStyle = palette.blockC.fill;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(width * 0.82, height * 0.22, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.architectureLight;
      ctx.globalAlpha = 0.46;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(width * 0.82, height * 0.22, 86, 18, -0.22, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.architectureMid;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(-PARALLAX_OVERSCAN_X, height);
      ctx.lineTo(-PARALLAX_OVERSCAN_X, horizonY - 28);
      ctx.lineTo(width * 0.18, horizonY - 58);
      ctx.lineTo(width * 0.28, horizonY - 58);
      ctx.lineTo(width * 0.34, horizonY - 22);
      ctx.lineTo(width * 0.64, horizonY - 26);
      ctx.lineTo(width * 0.71, horizonY - 72);
      ctx.lineTo(width * 0.82, horizonY - 72);
      ctx.lineTo(width + PARALLAX_OVERSCAN_X, horizonY - 30);
      ctx.lineTo(width + PARALLAX_OVERSCAN_X, height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = palette.architectureLight;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-PARALLAX_OVERSCAN_X, horizonY - 28);
      ctx.lineTo(width * 0.18, horizonY - 58);
      ctx.lineTo(width * 0.28, horizonY - 58);
      ctx.lineTo(width * 0.34, horizonY - 22);
      ctx.lineTo(width * 0.64, horizonY - 26);
      ctx.lineTo(width * 0.71, horizonY - 72);
      ctx.lineTo(width * 0.82, horizonY - 72);
      ctx.lineTo(width + PARALLAX_OVERSCAN_X, horizonY - 30);
      ctx.stroke();
    }

    if (
      theme === 'monument_valley' ||
      theme === 'sennaar' ||
      theme === 'fez' ||
      theme === 'hyper_light' ||
      theme === 'transistor' ||
      theme === 'sable' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'aurora_prism' ||
      theme === 'neo_andean' ||
      theme === 'stained_glass'
    ) {
      ctx.globalAlpha = 0.36;
      this.drawIsoTower(ctx, width * 0.26, horizonY - 8, 62, 118, skin, true, false);
      this.drawIsoTower(ctx, width * 0.72, horizonY - 6, 68, 134, skin, true, true);
      this.drawIsoTower(ctx, width * 0.42, horizonY - 14, 48, 86, skin, false, false);
    }

    const mistGrad = ctx.createLinearGradient(0, horizonY - 95, 0, horizonY + 20);
    mistGrad.addColorStop(0, 'rgba(250, 246, 238, 0)');
    mistGrad.addColorStop(0.65, palette.horizonMist);
    mistGrad.addColorStop(1, 'rgba(250, 246, 238, 0)');
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = mistGrad;
    ctx.fillRect(-PARALLAX_OVERSCAN_X, horizonY - 95, width + PARALLAX_OVERSCAN_X * 2, 115);

    ctx.restore();
  }

  private drawMidLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig
  ): void {
    const { palette, theme } = skin;
    const horizonY = height * 0.76;
    const fullW = width + PARALLAX_OVERSCAN_X * 2;
    const startX = -PARALLAX_OVERSCAN_X;

    switch (theme) {
      case 'monument_valley': {
        this.drawIsoTower(ctx, width * 0.14, horizonY, 108, 200, skin, true, false);
        this.drawIsoTower(ctx, width * 0.87, horizonY, 118, 230, skin, true, true);
        this.drawIsoTower(ctx, width * 0.08, horizonY + 12, 82, 145, skin, true, true);
        this.drawIsoTower(ctx, width * 0.78, horizonY + 6, 76, 125, skin, true, false);
        this.drawIsoTower(ctx, width * 0.93, horizonY + 14, 90, 170, skin, true, false);
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.52;
        ctx.fillRect(width * 0.14, horizonY - 68, width * 0.14, 12);
        ctx.fillRect(width * 0.72, horizonY - 76, width * 0.15, 12);
        ctx.globalAlpha = 1;
        break;
      }
      case 'gorogoa': {
        [width * 0.13, width * 0.87].forEach((cx, idx) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.52;
          this.roundRect(ctx, cx - 76, height * 0.18, 152, height * 0.64, 24);
          ctx.fill();
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.72;
          ctx.beginPath();
          ctx.arc(cx, height * 0.44, 48, Math.PI, 0);
          ctx.lineTo(cx + 48, height * 0.78);
          ctx.lineTo(cx - 48, height * 0.78);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = idx === 0 ? palette.blockA.highlight : palette.blockB.highlight;
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(cx, height * 0.36, 26, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'gris': {
        const blooms = [
          { x: width * 0.18, y: height * 0.36, r: 220, c: 'rgba(223, 142, 166, 0.24)' },
          { x: width * 0.82, y: height * 0.42, r: 250, c: 'rgba(126, 170, 181, 0.24)' },
          { x: width * 0.52, y: height * 0.72, r: 290, c: 'rgba(203, 183, 198, 0.25)' },
        ];
        for (const b of blooms) {
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, b.c);
          g.addColorStop(0.7, b.c);
          g.addColorStop(1, 'rgba(250, 246, 238, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.36;
        this.roundRect(ctx, width * 0.07, height * 0.32, 48, height * 0.68, 22);
        ctx.fill();
        this.roundRect(ctx, width * 0.88, height * 0.26, 54, height * 0.74, 24);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(startX, horizonY + 30);
        ctx.quadraticCurveTo(width * 0.26, horizonY - 82, width * 0.58, horizonY + 8);
        ctx.quadraticCurveTo(width * 0.82, horizonY - 76, width + PARALLAX_OVERSCAN_X, horizonY - 40);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'sennaar': {
        const drawZiggurat = (cx: number, baseW: number, tiers: number) => {
          for (let t = 0; t < tiers; t++) {
            const tw = baseW * (1 - t * 0.16);
            const th = 36;
            const ty = horizonY - (t + 1) * th;
            ctx.fillStyle = t % 2 === 0 ? palette.architectureMid : palette.architectureShadow;
            this.roundRect(ctx, cx - tw / 2, ty, tw, th + 4, 8);
            ctx.fill();
          }
          ctx.fillStyle = palette.architectureLight;
          ctx.beginPath();
          ctx.arc(cx, horizonY - tiers * 36, baseW * 0.18, Math.PI, 0);
          ctx.fill();
        };
        drawZiggurat(width * 0.15, 220, 5);
        drawZiggurat(width * 0.85, 240, 6);
        ctx.fillStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.55;
        this.roundRect(ctx, width * 0.065, 72, 22, 168, 11);
        ctx.fill();
        this.roundRect(ctx, width * 0.915, 72, 22, 188, 11);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'papetura': {
        ctx.save();
        ctx.shadowColor = 'rgba(110, 68, 30, 0.22)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = palette.architectureLight;
        ctx.beginPath();
        ctx.moveTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, height * 0.16);
        ctx.quadraticCurveTo(width * 0.18, height * 0.24, width * 0.14, height * 0.56);
        ctx.quadraticCurveTo(width * 0.12, height * 0.78, width * 0.28, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height * 0.12);
        ctx.quadraticCurveTo(width * 0.82, height * 0.28, width * 0.86, height * 0.58);
        ctx.quadraticCurveTo(width * 0.88, height * 0.80, width * 0.72, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'old_mans_journey': {
        ctx.fillStyle = palette.waterSurface;
        ctx.fillRect(startX, horizonY - 10, fullW, height - horizonY + 10 + PARALLAX_OVERSCAN_Y);
        const drawHill = (yOff: number, amp: number, phase: number, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(startX, height + PARALLAX_OVERSCAN_Y);
          for (let x = startX; x <= width + PARALLAX_OVERSCAN_X; x += 24) {
            const y = yOff + Math.sin(x * 0.004 + phase) * amp;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
          ctx.closePath();
          ctx.fill();
        };
        drawHill(horizonY - 45, 36, 0.5, palette.architectureMid);
        drawHill(horizonY + 8, 28, 2.2, palette.architectureShadow);
        ctx.fillStyle = palette.architectureLight;
        ctx.fillRect(width * 0.11, horizonY - 92, 34, 24);
        ctx.fillStyle = palette.hudAccent;
        ctx.beginPath();
        ctx.moveTo(width * 0.11 - 4, horizonY - 92);
        ctx.lineTo(width * 0.11 + 17, horizonY - 108);
        ctx.lineTo(width * 0.11 + 38, horizonY - 92);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'journey': {
        ctx.fillStyle = palette.architectureLight;
        ctx.beginPath();
        ctx.moveTo(width * 0.42, horizonY - 10);
        ctx.lineTo(width * 0.49, height * 0.25);
        ctx.lineTo(width * 0.50, height * 0.34);
        ctx.lineTo(width * 0.51, height * 0.25);
        ctx.lineTo(width * 0.58, horizonY - 10);
        ctx.closePath();
        ctx.fill();

        const drawDune = (baseY: number, curveY: number, color: string, flip: boolean) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(startX, height + PARALLAX_OVERSCAN_Y);
          ctx.lineTo(startX, baseY);
          ctx.quadraticCurveTo(width * (flip ? 0.65 : 0.35), curveY, width + PARALLAX_OVERSCAN_X, baseY + 35);
          ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
          ctx.closePath();
          ctx.fill();
        };
        drawDune(horizonY - 50, horizonY - 120, palette.architectureMid, false);
        drawDune(horizonY + 10, horizonY - 40, palette.architectureShadow, true);
        break;
      }
      case 'altos_odyssey': {
        ctx.fillStyle = 'rgba(255, 245, 232, 0.85)';
        ctx.beginPath();
        ctx.arc(width * 0.82, height * 0.2, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.skyTop;
        ctx.beginPath();
        ctx.arc(width * 0.82 + 12, height * 0.2 - 6, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.architectureMid;
        ctx.beginPath();
        ctx.moveTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, horizonY - 90);
        ctx.lineTo(width * 0.16, horizonY - 90);
        ctx.lineTo(width * 0.22, horizonY - 20);
        ctx.lineTo(width * 0.78, horizonY - 30);
        ctx.lineTo(width * 0.84, horizonY - 110);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, horizonY - 110);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'hohokum': {
        ctx.strokeStyle = palette.architectureMid;
        ctx.lineWidth = 26;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX - 20, height * 0.72);
        ctx.bezierCurveTo(width * 0.25, height * 0.45, width * 0.65, height * 0.9, width + PARALLAX_OVERSCAN_X + 20, height * 0.56);
        ctx.stroke();

        ctx.strokeStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(startX - 20, height * 0.26);
        ctx.bezierCurveTo(width * 0.35, height * 0.1, width * 0.7, height * 0.45, width + PARALLAX_OVERSCAN_X + 20, height * 0.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'kentucky_rz': {
        ctx.fillStyle = palette.architectureShadow;
        ctx.beginPath();
        ctx.moveTo(width * 0.46, horizonY);
        ctx.lineTo(width * 0.54, horizonY);
        ctx.lineTo(width * 0.82, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(width * 0.18, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        [width * 0.12, width * 0.88].forEach((lx) => {
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.5;
          this.roundRect(ctx, lx - 5, horizonY - 180, 10, 192, 5);
          ctx.fill();
          ctx.globalAlpha = 1;
          const g = ctx.createRadialGradient(lx, horizonY - 180, 0, lx, horizonY - 180, 78);
          g.addColorStop(0, 'rgba(227, 186, 134, 0.55)');
          g.addColorStop(1, 'rgba(227, 186, 134, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(lx, horizonY - 180, 78, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = palette.architectureLight;
          ctx.beginPath();
          ctx.arc(lx, horizonY - 180, 12, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case 'limbo_inside': {
        const spot = ctx.createRadialGradient(width * 0.5, 0, 20, width * 0.5, height * 0.65, width * 0.48);
        spot.addColorStop(0, 'rgba(250, 246, 238, 0.42)');
        spot.addColorStop(1, 'rgba(250, 246, 238, 0)');
        ctx.fillStyle = spot;
        ctx.fillRect(startX, 0, fullW, height);

        ctx.fillStyle = palette.architectureShadow;
        [0.05, 0.11, 0.18, 0.82, 0.89, 0.95].forEach((rx, idx) => {
          const tx = width * rx;
          const tw = 16 + (idx % 3) * 8;
          this.roundRect(ctx, tx - tw / 2, -PARALLAX_OVERSCAN_Y, tw, height + PARALLAX_OVERSCAN_Y * 2, tw * 0.4);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(tx, height * (0.28 + (idx % 2) * 0.14), tw * 1.45, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillRect(startX, horizonY + 28, fullW, height - horizonY + PARALLAX_OVERSCAN_Y);
        break;
      }
      case 'transistor': {
        ctx.save();
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.13;
        ctx.beginPath();
        ctx.moveTo(width * 0.5, height * 0.88);
        ctx.lineTo(width * 0.14, height * 0.15);
        ctx.lineTo(width * 0.32, height * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(width * 0.5, height * 0.88);
        ctx.lineTo(width * 0.86, height * 0.14);
        ctx.lineTo(width * 0.68, height * 0.08);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.42;
        this.roundRect(ctx, 44, 88, 102, height - 176, 16);
        ctx.fill();
        this.roundRect(ctx, width - 146, 88, 102, height - 176, 16);
        ctx.fill();
        ctx.fillStyle = palette.blockA.highlight;
        ctx.globalAlpha = 0.25;
        this.fillCircle(ctx, 95, 160, 22);
        this.fillCircle(ctx, width - 95, 160, 22);
        ctx.restore();
        break;
      }
      case 'hyper_light': {
        const drawCrystal = (cx: number, by: number, w: number, h: number) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.beginPath();
          ctx.moveTo(cx, by - h);
          ctx.lineTo(cx - w / 2, by);
          ctx.lineTo(cx, by + 12);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.architectureMid;
          ctx.beginPath();
          ctx.moveTo(cx, by - h);
          ctx.lineTo(cx + w / 2, by);
          ctx.lineTo(cx, by + 12);
          ctx.closePath();
          ctx.fill();
        };
        drawCrystal(width * 0.12, horizonY, 90, 260);
        drawCrystal(width * 0.88, horizonY, 104, 300);
        drawCrystal(width * 0.21, horizonY + 10, 56, 150);
        break;
      }
      case 'fez': {
        [
          { x: width * 0.08, y: height * 0.34, w: 96, h: 32 },
          { x: width * 0.82, y: height * 0.28, w: 112, h: 34 },
          { x: width * 0.06, y: height * 0.62, w: 130, h: 36 },
          { x: width * 0.85, y: height * 0.60, w: 120, h: 36 },
        ].forEach((p, idx) => {
          ctx.fillStyle = palette.architectureMid;
          this.roundRect(ctx, p.x, p.y, p.w, 14, 7);
          ctx.fill();
          ctx.fillStyle = palette.architectureShadow;
          this.roundRect(ctx, p.x + 8, p.y + 12, p.w - 16, p.h - 10, 8);
          ctx.fill();
          ctx.fillStyle = idx % 2 === 0 ? palette.blockA.highlight : palette.blockB.highlight;
          ctx.globalAlpha = 0.45;
          this.drawDiamond(ctx, p.x + p.w * 0.5, p.y - 16, 10);
          ctx.globalAlpha = 1;
        });
        break;
      }
      case 'sable': {
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.38;
        ctx.beginPath();
        ctx.arc(width * 0.8, height * 0.22, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.skyTop;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(width * 0.8 + 16, height * 0.22 - 8, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = palette.architectureMid;
        ctx.beginPath();
        ctx.moveTo(startX, horizonY - 20);
        ctx.lineTo(width * 0.14, horizonY - 130);
        ctx.lineTo(width * 0.24, horizonY - 130);
        ctx.lineTo(width * 0.34, horizonY - 15);
        ctx.lineTo(width * 0.72, horizonY - 15);
        ctx.lineTo(width * 0.84, horizonY - 150);
        ctx.lineTo(width * 0.94, horizonY - 150);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, horizonY - 30);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'spiritfarer': {
        const lanterns = [
          { x: width * 0.1, y: height * 0.25 },
          { x: width * 0.18, y: height * 0.36 },
          { x: width * 0.84, y: height * 0.24 },
          { x: width * 0.91, y: height * 0.38 },
        ];
        for (const l of lanterns) {
          ctx.strokeStyle = palette.architectureShadow;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(l.x, -PARALLAX_OVERSCAN_Y);
          ctx.lineTo(l.x, l.y);
          ctx.stroke();
          ctx.fillStyle = palette.blockA.highlight;
          ctx.beginPath();
          ctx.ellipse(l.x, l.y + 14, 14, 18, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'abzu': {
        ctx.save();
        ctx.fillStyle = 'rgba(250, 246, 238, 0.16)';
        [0.18, 0.42, 0.68].forEach((rx) => {
          ctx.beginPath();
          ctx.moveTo(width * rx, -PARALLAX_OVERSCAN_Y);
          ctx.lineTo(width * rx + 70, -PARALLAX_OVERSCAN_Y);
          ctx.lineTo(width * rx + 210, height + PARALLAX_OVERSCAN_Y);
          ctx.lineTo(width * rx + 40, height + PARALLAX_OVERSCAN_Y);
          ctx.closePath();
          ctx.fill();
        });
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.38;
        [0.06, 0.12, 0.88, 0.94].forEach((kx, i) => {
          const x = width * kx;
          ctx.beginPath();
          ctx.moveTo(x - 10, height + PARALLAX_OVERSCAN_Y);
          ctx.quadraticCurveTo(x + (i % 2 === 0 ? 28 : -28), height * 0.6, x, height * 0.26);
          ctx.quadraticCurveTo(x + (i % 2 === 0 ? -12 : 12), height * 0.6, x + 12, height + PARALLAX_OVERSCAN_Y);
          ctx.closePath();
          ctx.fill();
        });
        ctx.restore();
        break;
      }
      case 'sayonara': {
        ctx.save();
        [width * 0.12, width * 0.88].forEach((cx, idx) => {
          const cy = height * 0.44;
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.arc(cx, cy, 86, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = idx === 0 ? palette.blockA.highlight : palette.blockB.highlight;
          ctx.globalAlpha = 0.18;
          this.drawDiamond(ctx, cx, cy, 94);
        });
        ctx.restore();
        break;
      }
      case 'machinarium': {
        const drawGear = (cx: number, cy: number, r: number, teeth: number, color: string) => {
          ctx.save();
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let i = 0; i < teeth * 2; i++) {
            const ang = (i / (teeth * 2)) * Math.PI * 2;
            const rad = i % 2 === 0 ? r : r * 0.84;
            const px = cx + Math.cos(ang) * rad;
            const py = cy + Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.skyMid;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        };
        ctx.globalAlpha = 0.45;
        drawGear(width * 0.1, height * 0.72, 110, 12, palette.architectureShadow);
        drawGear(width * 0.21, height * 0.84, 72, 10, palette.architectureMid);
        drawGear(width * 0.9, height * 0.7, 120, 14, palette.architectureShadow);
        ctx.globalAlpha = 1;
        break;
      }
      case 'ori': {
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(startX, -PARALLAX_OVERSCAN_Y);
        ctx.lineTo(width * 0.22, -PARALLAX_OVERSCAN_Y);
        ctx.quadraticCurveTo(width * 0.14, height * 0.45, width * 0.18, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(width + PARALLAX_OVERSCAN_X, -PARALLAX_OVERSCAN_Y);
        ctx.lineTo(width * 0.78, -PARALLAX_OVERSCAN_Y);
        ctx.quadraticCurveTo(width * 0.86, height * 0.45, width * 0.82, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'cityscape_deco': {
        const towers = [
          { x: width * 0.03, w: 64, h: 245, tone: palette.architectureShadow, dome: true },
          { x: width * 0.09, w: 58, h: 315, tone: palette.blockA.fill, dome: false },
          { x: width * 0.16, w: 60, h: 205, tone: palette.architectureMid, dome: true },
          { x: width * 0.76, w: 62, h: 225, tone: palette.architectureMid, dome: true },
          { x: width * 0.83, w: 68, h: 305, tone: palette.blockA.fill, dome: false },
          { x: width * 0.90, w: 58, h: 255, tone: palette.architectureShadow, dome: true },
        ];
        towers.forEach((t, idx) => {
          const topY = horizonY - t.h;
          ctx.fillStyle = t.tone;
          ctx.globalAlpha = idx === 1 || idx === 4 ? 0.56 : 0.42;
          this.roundRect(ctx, t.x, topY, t.w, t.h + 45, 14);
          ctx.fill();
          if (t.dome) {
            ctx.beginPath();
            ctx.arc(t.x + t.w * 0.5, topY + 2, t.w * 0.36, Math.PI, 0);
            ctx.fill();
          } else {
            ctx.fillStyle = palette.architectureLight;
            ctx.globalAlpha = 0.42;
            this.roundRect(ctx, t.x + t.w * 0.22, topY - 18, t.w * 0.56, 22, 8);
            ctx.fill();
          }
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.48;
          for (let wy = topY + 24; wy < horizonY - 16; wy += 24) {
            for (let col = 0; col < 2; col++) {
              const wx = t.x + t.w * (0.3 + col * 0.4);
              ctx.beginPath();
              ctx.arc(wx, wy, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'noland_target': {
        const targets = [
          { x: width * 0.11, y: height * 0.36, outer: palette.blockA.fill, inner: palette.blockB.fill, r: 54 },
          { x: width * 0.11, y: height * 0.62, outer: palette.blockB.fill, inner: palette.blockA.highlight, r: 44 },
          { x: width * 0.89, y: height * 0.36, outer: palette.blockB.fill, inner: palette.blockA.fill, r: 54 },
          { x: width * 0.89, y: height * 0.62, outer: palette.blockA.fill, inner: palette.blockB.highlight, r: 44 },
        ];
        targets.forEach((tg) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.56;
          this.roundRect(ctx, tg.x - tg.r - 8, tg.y - tg.r - 8, (tg.r + 8) * 2, (tg.r + 8) * 2, 18);
          ctx.fill();
          ctx.fillStyle = tg.outer;
          ctx.globalAlpha = 0.48;
          ctx.beginPath();
          ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = tg.inner;
          ctx.globalAlpha = 0.52;
          ctx.beginPath();
          ctx.arc(tg.x, tg.y, tg.r * 0.56, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'artisan_blocks': {
        const tiles = [
          { x: width * 0.06, y: height * 0.28, s: 58, fill: palette.blockA.fill, accent: palette.architectureLight },
          { x: width * 0.13, y: height * 0.46, s: 52, fill: palette.blockB.fill, accent: palette.blockA.highlight },
          { x: width * 0.07, y: height * 0.64, s: 60, fill: palette.architectureMid, accent: palette.architectureShadow },
          { x: width * 0.86, y: height * 0.28, s: 58, fill: palette.blockB.fill, accent: palette.architectureLight },
          { x: width * 0.81, y: height * 0.48, s: 52, fill: palette.blockA.fill, accent: palette.architectureShadow },
          { x: width * 0.87, y: height * 0.65, s: 60, fill: palette.architectureMid, accent: palette.blockB.highlight },
        ];
        tiles.forEach((tl, idx) => {
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.2;
          this.roundRect(ctx, tl.x + 5, tl.y + 6, tl.s, tl.s, 14);
          ctx.fill();
          ctx.fillStyle = tl.fill;
          ctx.globalAlpha = 0.46;
          this.roundRect(ctx, tl.x, tl.y, tl.s, tl.s, 14);
          ctx.fill();
          ctx.fillStyle = tl.accent;
          ctx.globalAlpha = 0.42;
          if (idx % 2 === 0) {
            ctx.beginPath();
            ctx.arc(tl.x + tl.s * 0.5, tl.y + tl.s * 0.5, tl.s * 0.26, 0, Math.PI * 2);
            ctx.fill();
          } else {
            this.drawDiamond(ctx, tl.x + tl.s * 0.5, tl.y + tl.s * 0.5, tl.s * 0.26);
          }
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'verdigris_terrace': {
        const drawArcade = (baseX: number, count: number) => {
          const span = 58;
          const archTop = horizonY - 120;
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.52;
          this.roundRect(ctx, baseX, archTop - 16, span * count, 18, 9);
          ctx.fill();
          for (let i = 0; i < count; i++) {
            const ax = baseX + i * span;
            ctx.fillStyle = palette.architectureShadow;
            this.roundRect(ctx, ax, archTop, 14, 125, 6);
            ctx.fill();
            ctx.fillStyle = palette.architectureLight;
            ctx.globalAlpha = 0.34;
            ctx.beginPath();
            ctx.arc(ax + span * 0.5, archTop + 26, span * 0.36, Math.PI, 0);
            ctx.fill();
            ctx.globalAlpha = 0.52;
          }
          ctx.fillStyle = palette.architectureShadow;
          this.roundRect(ctx, baseX + count * span - 14, archTop, 14, 125, 6);
          ctx.fill();
        };
        drawArcade(width * 0.03, 3);
        drawArcade(width * 0.78, 3);
        ctx.globalAlpha = 1;
        break;
      }
      case 'terracotta_mosaic': {
        const drawDome = (cx: number, r: number) => {
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.52;
          this.roundRect(ctx, cx - r * 1.1, horizonY - r * 1.15, r * 2.2, r * 1.15, 14);
          ctx.fill();
          ctx.fillStyle = palette.architectureLight;
          ctx.beginPath();
          ctx.arc(cx, horizonY - r * 1.15, r * 0.9, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = palette.architectureShadow;
          this.roundRect(ctx, cx - r * 0.3, horizonY - r * 0.72, r * 0.6, r * 0.72, r * 0.3);
          ctx.fill();
        };
        drawDome(width * 0.12, 68);
        drawDome(width * 0.88, 72);
        ctx.globalAlpha = 1;
        break;
      }
      case 'indigo_risograph': {
        ctx.fillStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(width * 0.12, height * 0.44, 72, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        ctx.arc(width * 0.15, height * 0.36, 38, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = palette.blockB.fill;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(width * 0.88, height * 0.56, 76, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.22;
        this.drawDiamond(ctx, width * 0.86, height * 0.42, 42);
        ctx.globalAlpha = 1;
        break;
      }
      case 'amber_encaustic': {
        const drawMesa = (pts: Array<[number, number]>, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          pts.forEach(([px, py], i) => {
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
        };
        ctx.globalAlpha = 0.55;
        drawMesa(
          [
            [startX, height + PARALLAX_OVERSCAN_Y],
            [startX, horizonY - 120],
            [width * 0.16, horizonY - 120],
            [width * 0.24, horizonY - 22],
            [width * 0.76, horizonY - 24],
            [width * 0.84, horizonY - 138],
            [width + PARALLAX_OVERSCAN_X, horizonY - 138],
            [width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y],
          ],
          palette.architectureShadow
        );
        ctx.globalAlpha = 1;
        break;
      }
      case 'celadon_fresco': {
        [width * 0.11, width * 0.89].forEach((cx) => {
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(cx, height * 0.52, 68, Math.PI, 0);
          ctx.lineTo(cx + 68, horizonY);
          ctx.lineTo(cx - 68, horizonY);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.26;
          ctx.beginPath();
          ctx.arc(cx, height * 0.52, 40, Math.PI, 0);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'ochre_skyline': {
        [
          { x: width * 0.08, h: 195 },
          { x: width * 0.89, h: 215 },
        ].forEach((crane, idx) => {
          const topY = horizonY - crane.h;
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.48;
          ctx.fillRect(crane.x, topY, 16, crane.h + 18);
          ctx.fillRect(crane.x - (idx === 0 ? 12 : 76), topY, 96, 12);
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.56;
          const sailX = idx === 0 ? crane.x + 68 : crane.x - 86;
          ctx.beginPath();
          ctx.moveTo(sailX, horizonY - 4);
          ctx.lineTo(sailX + (idx === 0 ? 52 : -52), horizonY - 4);
          ctx.lineTo(sailX + (idx === 0 ? 14 : -14), horizonY - 105);
          ctx.closePath();
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'aurora_prism': {
        ctx.fillStyle = palette.architectureMid;
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.moveTo(startX, horizonY + 12);
        ctx.lineTo(width * 0.12, horizonY - 150);
        ctx.lineTo(width * 0.27, horizonY - 18);
        ctx.lineTo(width * 0.72, horizonY - 22);
        ctx.lineTo(width * 0.86, horizonY - 168);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, horizonY + 12);
        ctx.lineTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
        ctx.lineTo(startX, height + PARALLAX_OVERSCAN_Y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'sumi_bamboo': {
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.34;
        [0.05, 0.11, 0.88, 0.94].forEach((rx, idx) => {
          const bx = width * rx;
          const segH = 44;
          for (let seg = 0; seg < 6; seg++) {
            const sy = horizonY + 24 - (seg + 1) * segH;
            this.roundRect(ctx, bx + Math.sin(seg + idx) * 2, sy, 9, segH - 4, 3);
            ctx.fill();
          }
        });
        ctx.fillStyle = palette.blockB.fill;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(width * 0.14, horizonY - 96, 8, 96);
        ctx.fillRect(width * 0.19, horizonY - 96, 8, 96);
        this.roundRect(ctx, width * 0.125, horizonY - 106, width * 0.095, 11, 4);
        ctx.fill();
        this.roundRect(ctx, width * 0.84, height * 0.26, 26, 46, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'cubist_atelier': {
        const planes = [
          { x: width * 0.04, y: height * 0.22, w: 120, h: 250, col: palette.blockA.fill, a: 0.38 },
          { x: width * 0.11, y: height * 0.34, w: 92, h: 190, col: palette.blockB.fill, a: 0.44 },
          { x: width * 0.82, y: height * 0.2, w: 128, h: 260, col: palette.blockB.fill, a: 0.4 },
          { x: width * 0.77, y: height * 0.38, w: 96, h: 200, col: palette.blockC.fill, a: 0.38 },
        ];
        planes.forEach((p) => {
          ctx.fillStyle = p.col;
          ctx.globalAlpha = p.a;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.w, p.y + 22);
          ctx.lineTo(p.x + p.w - 18, p.y + p.h);
          ctx.lineTo(p.x + 12, p.y + p.h - 24);
          ctx.closePath();
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'detroit_visor': {
        [
          { x: width * 0.03, w: 74, h: 270 },
          { x: width * 0.11, w: 56, h: 200 },
          { x: width * 0.82, w: 62, h: 215 },
          { x: width * 0.89, w: 78, h: 290 },
        ].forEach((b, idx) => {
          const topY = horizonY - b.h;
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.74;
          ctx.fillRect(b.x, topY, b.w, b.h + 25);
          ctx.fillStyle = idx % 2 === 0 ? palette.blockB.fill : palette.blockA.fill;
          ctx.globalAlpha = 0.72;
          ctx.fillRect(b.x + 8, topY + 18, b.w - 16, 4);
          ctx.fillRect(b.x + 8, topY + 32, b.w - 28, 3);
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'miami_vice': {
        [
          { x: width * 0.04, w: 92, h: 205, col: palette.architectureLight },
          { x: width * 0.85, w: 102, h: 225, col: palette.architectureLight },
        ].forEach((hotel, idx) => {
          const topY = horizonY - hotel.h;
          ctx.fillStyle = hotel.col;
          ctx.globalAlpha = 0.34;
          this.roundRect(ctx, hotel.x, topY, hotel.w, hotel.h + 15, 16);
          ctx.fill();
          ctx.fillStyle = idx === 0 ? palette.blockA.fill : palette.blockB.fill;
          ctx.globalAlpha = 0.65;
          ctx.fillRect(hotel.x + 10, topY + 16, hotel.w - 20, 5);
          ctx.fillRect(hotel.x + 14, topY + 30, hotel.w - 28, 4);
        });
        [width * 0.16, width * 0.82].forEach((px, idx) => {
          ctx.strokeStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.62;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(px, horizonY + 12);
          ctx.quadraticCurveTo(px + (idx === 0 ? -18 : 18), horizonY - 120, px + (idx === 0 ? 12 : -12), horizonY - 230);
          ctx.stroke();
          const crownX = px + (idx === 0 ? 12 : -12);
          const crownY = horizonY - 230;
          ctx.fillStyle = palette.architectureShadow;
          for (let f = 0; f < 5; f++) {
            const ang = -Math.PI + (f / 4) * Math.PI;
            ctx.beginPath();
            ctx.ellipse(crownX + Math.cos(ang) * 28, crownY + Math.sin(ang) * 14 + 6, 30, 7, ang * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'neo_andean': {
        [
          { x: width * 0.04, w: 120, baseH: 225, primary: palette.blockA.fill, sec: palette.blockB.fill },
          { x: width * 0.84, w: 126, baseH: 240, primary: palette.blockB.fill, sec: palette.blockC.fill },
        ].forEach((cholet) => {
          const topY = horizonY - cholet.baseH;
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.68;
          ctx.fillRect(cholet.x, topY + 28, cholet.w, cholet.baseH);
          ctx.fillStyle = cholet.primary;
          ctx.fillRect(cholet.x + 12, topY + 12, cholet.w - 24, 20);
          ctx.fillStyle = cholet.sec;
          ctx.fillRect(cholet.x + 28, topY - 6, cholet.w - 56, 20);
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.56;
          ctx.beginPath();
          ctx.arc(cholet.x + cholet.w * 0.5, topY + 86, 26, Math.PI, 0);
          ctx.lineTo(cholet.x + cholet.w * 0.5 + 26, horizonY - 18);
          ctx.lineTo(cholet.x + cholet.w * 0.5 - 26, horizonY - 18);
          ctx.closePath();
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'neko_sketchbook': {
        ctx.fillStyle = palette.architectureMid;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(width * 0.04, horizonY - 12, width * 0.22, 16);
        ctx.fillRect(width * 0.74, horizonY - 12, width * 0.22, 16);
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.22;
        [0.24, 0.38, 0.52, 0.66].forEach((ry, idx) => {
          const px = idx % 2 === 0 ? width * 0.07 : width * 0.93;
          const py = height * ry;
          this.fillCircle(ctx, px, py, 7);
          this.fillCircle(ctx, px - 6, py - 9, 2.8);
          this.fillCircle(ctx, px, py - 11, 2.8);
          this.fillCircle(ctx, px + 6, py - 9, 2.8);
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'stained_glass': {
        [width * 0.1, width * 0.9].forEach((lx) => {
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(lx, height * 0.34, 52, Math.PI, 0);
          ctx.lineTo(lx + 52, horizonY + 12);
          ctx.lineTo(lx - 52, horizonY + 12);
          ctx.closePath();
          ctx.fill();

          const panes = [palette.blockA.fill, palette.blockB.fill, palette.blockC.fill];
          panes.forEach((col, pIdx) => {
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.42;
            this.roundRect(ctx, lx - 38, height * (0.35 + pIdx * 0.13), 76, height * 0.1, 8);
            ctx.fill();
          });
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'constructivist': {
        ctx.fillStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.48;
        ctx.beginPath();
        ctx.moveTo(startX, horizonY);
        ctx.lineTo(width * 0.24, height * 0.22);
        ctx.lineTo(width * 0.3, height * 0.26);
        ctx.lineTo(width * 0.08, horizonY + 30);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(width * 0.82, height * 0.16, 42, horizonY - height * 0.16);
        ctx.fillStyle = palette.blockC.fill;
        ctx.globalAlpha = 0.56;
        ctx.beginPath();
        ctx.arc(width * 0.84, height * 0.3, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'botanical_herbarium': {
        [width * 0.11, width * 0.89].forEach((cx) => {
          ctx.strokeStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.36;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, height * 0.38, 62, Math.PI, 0);
          ctx.lineTo(cx + 62, horizonY);
          ctx.moveTo(cx - 62, height * 0.38);
          ctx.lineTo(cx - 62, horizonY);
          ctx.stroke();

          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.24;
          ctx.beginPath();
          ctx.ellipse(cx, height * 0.56, 36, 72, 0, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'memphis_milano': {
        ctx.fillStyle = palette.blockB.fill;
        ctx.globalAlpha = 0.45;
        this.roundRect(ctx, width * 0.05, horizonY - 190, 96, 190, 14);
        ctx.fill();
        ctx.fillStyle = palette.blockC.fill;
        ctx.globalAlpha = 0.55;
        this.roundRect(ctx, width * 0.03, horizonY - 210, 136, 22, 11);
        ctx.fill();

        ctx.fillStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.46;
        ctx.beginPath();
        ctx.arc(width * 0.89, horizonY - 120, 62, Math.PI, 0);
        ctx.lineTo(width * 0.89 + 62, horizonY);
        ctx.lineTo(width * 0.89 - 62, horizonY);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'scandi_showroom': {
        [width * 0.09, width * 0.91].forEach((cx, idx) => {
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.22;
          this.roundRect(ctx, cx - 72, horizonY - 220, 144, 220, 10);
          ctx.fill();
          ctx.strokeStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 4;
          ctx.strokeRect(cx - 46, horizonY - 118, 92, 92);
          ctx.beginPath();
          ctx.moveTo(cx, horizonY - 118);
          ctx.lineTo(cx, horizonY - 26);
          ctx.moveTo(cx - 46, horizonY - 72);
          ctx.lineTo(cx + 46, horizonY - 72);
          ctx.stroke();
          ctx.fillStyle = palette.blockB.fill;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(idx === 0 ? cx + 4 : cx - 42, horizonY - 68, 38, 38);

          ctx.strokeStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.52;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, height * 0.24);
          ctx.stroke();
          ctx.fillStyle = palette.blockB.fill;
          ctx.globalAlpha = 0.72;
          ctx.beginPath();
          ctx.arc(cx, height * 0.28, 30, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
        });
        ctx.fillStyle = palette.blockB.fill;
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.moveTo(width * 0.18, horizonY + 26);
        ctx.lineTo(width * 0.28, horizonY + 26);
        ctx.lineTo(width * 0.30, horizonY + 42);
        ctx.lineTo(width * 0.20, horizonY + 42);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'grand_budapest': {
        [width * 0.11, width * 0.89].forEach((cx) => {
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.38;
          ctx.fillRect(cx - 70, horizonY - 210, 140, 210);
          ctx.fillStyle = palette.blockB.fill;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.moveTo(cx - 78, horizonY - 210);
          ctx.lineTo(cx, horizonY - 265);
          ctx.lineTo(cx + 78, horizonY - 210);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.72;
          [-34, 0, 34].forEach((ox) => {
            [-165, -105].forEach((oy) => {
              this.roundRect(ctx, cx + ox - 10, horizonY + oy, 20, 34, 10);
              ctx.fill();
            });
          });
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'ghibli_express': {
        ctx.strokeStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(startX, horizonY + 12);
        ctx.lineTo(startX + fullW, horizonY + 12);
        ctx.stroke();
        for (let x = width * 0.06; x < width * 0.96; x += width * 0.12) {
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x - 3, horizonY + 12, 6, 46);
          ctx.fillRect(x - 1.5, horizonY - 56, 3, 68);
          ctx.fillRect(x - 10, horizonY - 50, 20, 2.5);
        }
        ctx.fillStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.56;
        this.roundRect(ctx, width * 0.07, horizonY - 20, 128, 30, 6);
        ctx.fill();
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.78;
        for (let wx = 0; wx < 5; wx++) {
          ctx.fillRect(width * 0.08 + wx * 22, horizonY - 13, 14, 10);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'de_stijl': {
        const drawPanel = (px: number, py: number, pw: number, ph: number) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.48;
          ctx.fillRect(px, py, pw * 0.55, ph * 0.45);
          ctx.fillStyle = palette.blockB.fill;
          ctx.fillRect(px + pw * 0.55, py + ph * 0.45, pw * 0.45, ph * 0.55);
          ctx.fillStyle = palette.blockC.fill;
          ctx.fillRect(px, py + ph * 0.65, pw * 0.34, ph * 0.35);
          ctx.strokeStyle = palette.boardFrame;
          ctx.globalAlpha = 0.62;
          ctx.lineWidth = 4;
          ctx.strokeRect(px, py, pw, ph);
          ctx.beginPath();
          ctx.moveTo(px + pw * 0.55, py);
          ctx.lineTo(px + pw * 0.55, py + ph);
          ctx.moveTo(px, py + ph * 0.45);
          ctx.lineTo(px + pw, py + ph * 0.45);
          ctx.stroke();
        };
        drawPanel(width * 0.025, horizonY - 230, 130, 200);
        drawPanel(width * 0.875, horizonY - 210, 124, 185);
        ctx.globalAlpha = 1;
        break;
      }
      case 'ukiyoe_wave': {
        [
          { cx: width * 0.14, dir: 1 },
          { cx: width * 0.86, dir: -1 },
        ].forEach(({ cx, dir }) => {
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.moveTo(cx - dir * 130, horizonY + 18);
          ctx.quadraticCurveTo(cx - dir * 40, horizonY - 180, cx + dir * 65, horizonY - 120);
          ctx.quadraticCurveTo(cx - dir * 5, horizonY - 82, cx + dir * 110, horizonY + 18);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = palette.architectureLight;
          ctx.globalAlpha = 0.72;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(cx + dir * 24, horizonY - 108, 44, 0.2, Math.PI * 1.15);
          ctx.stroke();
        });
        ctx.fillStyle = palette.blockC.fill;
        ctx.globalAlpha = 0.58;
        ctx.fillRect(width * 0.04, height * 0.14, 24, 58);
        ctx.globalAlpha = 1;
        break;
      }
      case 'kodak_cinema': {
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.36;
        ctx.fillRect(width * 0.03, horizonY - 110, 130, 110);
        ctx.fillRect(width * 0.84, horizonY - 135, 136, 135);
        [width * 0.025, width * 0.96].forEach((fx) => {
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.34;
          for (let sy = height * 0.16; sy < horizonY; sy += 34) {
            this.roundRect(ctx, fx, sy, 14, 20, 3);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'kinetic_bauhaus': {
        [
          { anchorX: width * 0.14, span: 78 },
          { anchorX: width * 0.86, span: -82 },
        ].forEach(({ anchorX, span }) => {
          ctx.strokeStyle = palette.boardFrame;
          ctx.globalAlpha = 0.52;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(anchorX, 0);
          ctx.lineTo(anchorX, height * 0.22);
          ctx.moveTo(anchorX - span * 0.6, height * 0.24);
          ctx.lineTo(anchorX + span * 0.8, height * 0.18);
          ctx.stroke();
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.62;
          ctx.beginPath();
          ctx.arc(anchorX - span * 0.6, height * 0.29, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = palette.blockB.fill;
          ctx.beginPath();
          ctx.moveTo(anchorX + span * 0.8, height * 0.18);
          ctx.lineTo(anchorX + span * 0.8 - 22, height * 0.28);
          ctx.lineTo(anchorX + span * 0.8 + 22, height * 0.28);
          ctx.closePath();
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'synth_greenhouse': {
        [width * 0.12, width * 0.88].forEach((cx) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.34;
          ctx.beginPath();
          ctx.arc(cx, horizonY, 108, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 2;
          ctx.stroke();
          for (let rx = -70; rx <= 70; rx += 35) {
            ctx.beginPath();
            ctx.ellipse(cx, horizonY, Math.abs(rx) + 12, 108, 0, Math.PI, 0);
            ctx.stroke();
          }
          ctx.fillStyle = palette.blockC.fill;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.arc(cx + 18, horizonY - 38, 16, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'vinyl_lounge': {
        [width * 0.1, width * 0.9].forEach((cx) => {
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.48;
          this.roundRect(ctx, cx - 58, horizonY - 190, 116, 190, 8);
          ctx.fill();
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.arc(cx, horizonY - 125, 34, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = palette.architectureShadow;
          ctx.globalAlpha = 0.72;
          ctx.beginPath();
          ctx.arc(cx, horizonY - 125, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = palette.blockB.fill;
          ctx.globalAlpha = 0.36;
          ctx.beginPath();
          ctx.arc(cx, horizonY - 46, 36, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'space_terminal': {
        [
          { cx: width * 0.13, dir: 1 },
          { cx: width * 0.87, dir: -1 },
        ].forEach(({ cx, dir }) => {
          ctx.fillStyle = palette.architectureLight;
          ctx.globalAlpha = 0.62;
          ctx.beginPath();
          ctx.moveTo(cx - dir * 120, horizonY);
          ctx.quadraticCurveTo(cx - dir * 10, horizonY - 230, cx + dir * 110, horizonY - 150);
          ctx.quadraticCurveTo(cx + dir * 35, horizonY - 95, cx + dir * 48, horizonY);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.56;
          ctx.beginPath();
          ctx.arc(cx + dir * 18, horizonY - 82, 16, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  private drawNearLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig
  ): void {
    const { palette, theme } = skin;
    const horizonY = height * 0.76;

    ctx.save();
    if (theme === 'sumi_bamboo') {
      ctx.fillStyle = palette.architectureShadow;
      ctx.globalAlpha = 0.38;
      [width * 0.025, width * 0.975].forEach((bx) => {
        ctx.fillRect(bx - 6, height * 0.64, 12, height * 0.42);
      });
    } else if (theme === 'neko_sketchbook') {
      ctx.fillStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.arc(width * 0.03, height * 0.96, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.blockB.fill;
      ctx.beginPath();
      ctx.arc(width * 0.97, height * 0.95, 60, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme === 'botanical_herbarium') {
      ctx.fillStyle = palette.architectureShadow;
      ctx.globalAlpha = 0.35;
      [0.03, 0.97].forEach((rx, idx) => {
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(width * rx + (idx === 0 ? k * 14 : -k * 14), height * 0.92 - k * 24, 34, 11, idx === 0 ? -0.4 : 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    } else if (theme === 'miami_vice') {
      [width * 0.015, width * 0.985 - 72].forEach((rx, idx) => {
        const ry = idx === 0 ? height * 0.78 : height * 0.76;
        const rh = idx === 0 ? height * 0.25 : height * 0.27;
        ctx.fillStyle = palette.architectureShadow;
        ctx.globalAlpha = 0.58;
        this.roundRect(ctx, rx, ry, 72, rh, 16);
        ctx.fill();
        ctx.fillStyle = palette.blockA.fill;
        ctx.globalAlpha = 0.55;
        this.roundRect(ctx, rx + 8, ry + 14, 56, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = palette.blockB.fill;
        ctx.globalAlpha = 0.52;
        this.roundRect(ctx, rx + 8, ry + 26, 56, 4, 2);
        ctx.fill();
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.38;
        this.roundRect(ctx, rx + 12, ry + 6, 48, 3, 1.5);
        ctx.fill();
      });
    } else if (theme === 'constructivist' || theme === 'cubist_atelier' || theme === 'memphis_milano' || theme === 'de_stijl' || theme === 'kinetic_bauhaus') {
      ctx.fillStyle = theme === 'constructivist' || theme === 'de_stijl' ? palette.blockA.fill : palette.architectureShadow;
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.moveTo(-PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
      ctx.lineTo(-PARALLAX_OVERSCAN_X, height * 0.78);
      ctx.lineTo(width * 0.09, height + PARALLAX_OVERSCAN_Y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme === 'memphis_milano' || theme === 'de_stijl' ? palette.blockC.fill : palette.architectureMid;
      ctx.beginPath();
      ctx.moveTo(width + PARALLAX_OVERSCAN_X, height + PARALLAX_OVERSCAN_Y);
      ctx.lineTo(width + PARALLAX_OVERSCAN_X, height * 0.76);
      ctx.lineTo(width * 0.9, height + PARALLAX_OVERSCAN_Y);
      ctx.closePath();
      ctx.fill();
    } else if (theme === 'scandi_showroom') {
      ctx.fillStyle = palette.architectureLight;
      ctx.globalAlpha = 0.56;
      this.roundRect(ctx, width * 0.01, height * 0.81, 88, 96, 6);
      ctx.fill();
      ctx.fillStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(width * 0.02, height * 0.83, 44, 14);
      ctx.fillStyle = palette.blockB.fill;
      ctx.fillRect(width * 0.91, height * 0.82, 74, 86);
    } else if (theme === 'gris' || theme === 'old_mans_journey' || theme === 'abzu' || theme === 'ori' || theme === 'ghibli_express' || theme === 'synth_greenhouse') {
      ctx.fillStyle = palette.architectureShadow;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.ellipse(width * 0.03, height * 0.96, 110, 74, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(width * 0.97, height * 0.95, 118, 82, 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.42;
      this.drawIsoTower(
        ctx,
        width * 0.025,
        height + PARALLAX_OVERSCAN_Y,
        88,
        height * 0.22,
        skin,
        false,
        false
      );
      this.drawIsoTower(
        ctx,
        width * 0.975,
        height + PARALLAX_OVERSCAN_Y,
        94,
        height * 0.25,
        skin,
        false,
        false
      );
    }

    ctx.fillStyle = palette.architectureLight;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(-PARALLAX_OVERSCAN_X, horizonY - 2, width + PARALLAX_OVERSCAN_X * 2, 5);
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(width * 0.14, horizonY + 14, 72, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(width * 0.86, horizonY + 16, 84, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawIsoTower(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    w: number,
    h: number,
    skin: SkinConfig,
    hasArch: boolean,
    hasSpire: boolean
  ): void {
    const { architectureLight, architectureMid, architectureShadow } = skin.palette;
    const halfW = w * 0.5;
    const isoH = w * 0.25;

    ctx.fillStyle = architectureLight;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY - isoH);
    ctx.lineTo(cx, baseY);
    ctx.lineTo(cx, baseY - h);
    ctx.lineTo(cx - halfW, baseY - h - isoH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = architectureMid;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(cx + halfW, baseY - isoH);
    ctx.lineTo(cx + halfW, baseY - h - isoH);
    ctx.lineTo(cx, baseY - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(250, 246, 238, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - h);
    ctx.lineTo(cx + halfW, baseY - h - isoH);
    ctx.lineTo(cx, baseY - h - isoH * 2);
    ctx.lineTo(cx - halfW, baseY - h - isoH);
    ctx.closePath();
    ctx.fill();

    if (hasArch && w > 40 && h > 70) {
      const archW = halfW * 0.42;
      const archH = Math.min(h * 0.42, 48);
      const ax = cx + halfW * 0.46;
      const ay = baseY - isoH * 0.46;
      ctx.fillStyle = architectureShadow;
      ctx.beginPath();
      ctx.moveTo(ax - archW * 0.5, ay);
      ctx.lineTo(ax - archW * 0.5, ay - archH * 0.6);
      ctx.arc(ax, ay - archH * 0.6, archW * 0.5, Math.PI, 0, false);
      ctx.lineTo(ax + archW * 0.5, ay);
      ctx.closePath();
      ctx.fill();
    }

    if (hasSpire) {
      const apexY = baseY - h - isoH * 2 - w * 0.55;
      ctx.fillStyle = architectureLight;
      ctx.beginPath();
      ctx.moveTo(cx - halfW * 0.42, baseY - h - isoH);
      ctx.lineTo(cx, baseY - h - isoH * 0.55);
      ctx.lineTo(cx, apexY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = architectureShadow;
      ctx.beginPath();
      ctx.moveTo(cx, baseY - h - isoH * 0.55);
      ctx.lineTo(cx + halfW * 0.42, baseY - h - isoH);
      ctx.lineTo(cx, apexY);
      ctx.closePath();
      ctx.fill();
    }
  }

  private writeGridCellJoins(
    grid: (Cell | null)[][],
    r: number,
    c: number,
    cell: Cell,
    out: NeighborJoins
  ): void {
    const rows = grid.length;
    const cols = grid[0]?.length ?? BOARD_COLS;
    if (
      cell.isObstacle ||
      cell.isWild ||
      cell.fallOffset > 0.15 ||
      Math.abs(cell.animOffsetX ?? 0) > 0.12 ||
      Math.abs(cell.animOffsetY ?? 0) > 0.12
    ) {
      out.top = false;
      out.right = false;
      out.bottom = false;
      out.left = false;
      return;
    }
    const matches = (nr: number, nc: number): boolean => {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
      const other = grid[nr][nc];
      return (
        other !== null &&
        !other.isObstacle &&
        !other.isWild &&
        other.color === cell.color &&
        other.fallOffset <= 0.15 &&
        Math.abs(other.animOffsetX ?? 0) <= 0.12 &&
        Math.abs(other.animOffsetY ?? 0) <= 0.12
      );
    };
    out.top = matches(r - 1, c);
    out.right = matches(r, c + 1);
    out.bottom = matches(r + 1, c);
    out.left = matches(r, c - 1);
  }

  private writePieceCellJoins(
    piece: Piece,
    py: number,
    px: number,
    out: NeighborJoins
  ): void {
    const cell = piece.cells[py]?.[px];
    if (!cell || cell.isBlocked || cell.isWild) {
      out.top = false;
      out.right = false;
      out.bottom = false;
      out.left = false;
      return;
    }
    const color = cell.color;
    const rows = piece.cells.length;
    const cols = piece.cells[py]?.length ?? 0;
    const matches = (nr: number, nc: number): boolean => {
      const other = piece.cells[nr]?.[nc];
      return Boolean(other && !other.isBlocked && !other.isWild && other.color === color);
    };
    out.top = py > 0 && matches(py - 1, px);
    out.bottom = py + 1 < rows && matches(py + 1, px);
    out.left = px > 0 && matches(py, px - 1);
    out.right = px + 1 < cols && matches(py, px + 1);
  }

  private writeNeighborRipple(
    boardIdx: 0 | 1,
    col: number,
    row: number,
    out: { liftPx: number; glow: number }
  ): void {
    let liftPx = 0;
    let glow = 0;
    for (let i = 0; i < MAX_LAND_RIPPLES; i++) {
      const rip = this.landRipples[i];
      if (!rip.active || rip.boardIdx !== boardIdx) continue;
      const t = rip.life / rip.maxLife;
      const dx = col - rip.col;
      const dy = row - rip.row;
      const dist = Math.hypot(dx, dy);
      if (dist > 4.2) continue;
      const waveRadius = t * 4.4;
      const delta = Math.abs(dist - waveRadius);
      if (delta < 1.35) {
        const envelope = (1 - t) * (1 - delta / 1.35);
        liftPx += envelope * 1.65;
        glow += envelope * 0.22;
      }
    }
    out.liftPx = liftPx;
    out.glow = Math.min(0.32, glow);
  }

  private drawBoard(
    ctx: CanvasRenderingContext2D,
    rect: BoardViewportRect,
    board: BoardState,
    skin: SkinConfig,
    timelineNorm: number,
    beatPhase: number,
    timeSec: number,
    label?: string,
    audioSpectrum: { subBass: number; mid: number; high: number; bands?: number[] } = {
      subBass: 0,
      mid: 0,
      high: 0,
    },
    boardIdx: 0 | 1 = 0
  ): void {
    const { x, y, width, height, cellSize } = rect;
    const { palette } = skin;
    const { subBass, mid, high, bands } = audioSpectrum;
    const boardRows = board.grid.length;
    const boardCols = board.grid[0]?.length ?? board.cols ?? BOARD_COLS;

    ctx.save();
    ctx.fillStyle = 'rgba(30, 22, 38, 0.12)';
    this.roundRect(ctx, x - 8, y - 4, width + 16, height + 20, 12);
    ctx.fill();

    if (board.comboLevel >= 2) {
      const comboStrength = Math.min(4, board.comboLevel - 1) / 4;
      const comboPulse = Math.pow(1 - beatPhase, 2.2);
      ctx.save();
      ctx.strokeStyle = palette.hudAccent;
      ctx.lineWidth = 3 + comboStrength * 2.5;
      ctx.globalAlpha = 0.16 + comboStrength * 0.14 + comboPulse * 0.14;
      this.roundRect(ctx, x - 9, y - 9, width + 18, height + 18, 13);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = compositeColorOnHex(palette.boardSurface, palette.skyMid);
    this.roundRect(ctx, x - 6, y - 6, width + 12, height + 12, 10);
    ctx.fill();
    ctx.fillStyle = palette.boardSurface;
    this.roundRect(ctx, x - 6, y - 6, width + 12, height + 12, 10);
    ctx.fill();

    this.drawBoardFrame(
      ctx,
      x,
      y,
      width,
      height,
      skin,
      board.pendingGarbage > 0,
      timeSec,
      beatPhase
    );

    if (board.upcomingShift) {
      const upPolarity = getShiftPolarity(board.upcomingShift);
      const upColor =
        upPolarity === 'boon'
          ? '#3db87a'
          : upPolarity === 'bane'
          ? '#e05b5b'
          : palette.hudAccent;
      const telePulse =
        timelineNorm >= 0.35
          ? 0.34 + 0.24 * Math.sin(timeSec * 7.5)
          : 0.18 + 0.08 * Math.sin(timeSec * 4.2);
      ctx.save();
      ctx.strokeStyle = upColor;
      ctx.lineWidth = timelineNorm >= 0.35 ? 3 : 1.8;
      ctx.globalAlpha = telePulse;
      this.roundRect(ctx, x - 9, y - 9, width + 18, height + 18, 13);
      ctx.stroke();
      ctx.restore();
    }

    if (board.pendingGarbage > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 8);
      ctx.save();
      ctx.fillStyle = palette.hudAccent;
      ctx.globalAlpha = 0.14 + pulse * 0.12;
      ctx.fillRect(x, y, width, 4);
      ctx.restore();
    }

    if (label) {
      ctx.fillStyle = isHexColorDark(palette.skyMid) ? '#faf7f2' : palette.hudInk;
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x, y - 16);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    const gridBeatPulse = Math.pow(1 - beatPhase, 2.8);
    ctx.save();
    ctx.strokeStyle = palette.gridLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.42 + gridBeatPulse * 0.14 + subBass * 0.12;
    ctx.beginPath();
    for (let c = 1; c < boardCols; c++) {
      const gx = x + c * cellSize;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + height);
    }
    for (let r = 1; r < boardRows; r++) {
      const gy = y + r * cellSize;
      ctx.moveTo(x, gy);
      ctx.lineTo(x + width, gy);
    }
    ctx.stroke();

    ctx.fillStyle = palette.gridLine;
    ctx.globalAlpha = 0.55 + gridBeatPulse * 0.2;
    for (let r = 1; r < boardRows; r++) {
      const gy = y + r * cellSize - 1;
      for (let c = 1; c < boardCols; c++) {
        ctx.fillRect(x + c * cellSize - 1, gy, 2, 2);
      }
    }
    ctx.restore();

    if (board.lockedColumnsLeft > 0) {
      ctx.fillStyle = 'rgba(60, 48, 66, 0.18)';
      ctx.fillRect(x, y, board.lockedColumnsLeft * cellSize, height);
    }
    if (board.lockedColumnsRight > 0) {
      ctx.fillStyle = 'rgba(60, 48, 66, 0.18)';
      ctx.fillRect(
        x + (boardCols - board.lockedColumnsRight) * cellSize,
        y,
        board.lockedColumnsRight * cellSize,
        height
      );
    }

    if (board.activeShift === 'sun_moon') {
      const isMoonPass = ((board.sweepPassCount ?? 0) % 2) === 1;
      const tintStyle = getBlockStyle(palette, isMoonPass ? 1 : 0);
      const wash = ctx.createLinearGradient(x, y, x, y + height);
      wash.addColorStop(0, hexToRgba(tintStyle.fill, 0.12));
      wash.addColorStop(1, hexToRgba(tintStyle.shade, 0.04));
      ctx.save();
      ctx.fillStyle = wash;
      ctx.fillRect(x, y, width, height);
      ctx.restore();
    }

    if (board.wellRegions && board.wellRegions.length >= 2) {
      const activeReg = getActiveWellRegion(board);
      ctx.save();

      if (board.activeShift === 'chromatic_wells') {
        const flip = Math.floor((board.sweepPassCount ?? 0) / 2) % 2;
        const leftReg = board.wellRegions[0];
        const rightReg = board.wellRegions[1];
        const leftColor = getBlockStyle(palette, flip as CellColor);
        const rightColor = getBlockStyle(palette, (1 - flip) as CellColor);
        ctx.fillStyle = hexToRgba(leftColor.fill, 0.085);
        ctx.fillRect(
          x + leftReg.minCol * cellSize,
          y + leftReg.minRow * cellSize,
          (leftReg.maxCol - leftReg.minCol + 1) * cellSize,
          (leftReg.maxRow - leftReg.minRow + 1) * cellSize
        );
        ctx.fillStyle = hexToRgba(rightColor.fill, 0.085);
        ctx.fillRect(
          x + rightReg.minCol * cellSize,
          y + rightReg.minRow * cellSize,
          (rightReg.maxCol - rightReg.minCol + 1) * cellSize,
          (rightReg.maxRow - rightReg.minRow + 1) * cellSize
        );
      }

      if (board.activeShift === 'clamshell' && board.wellRegions.length >= 2) {
        const seamY = y + (board.wellRegions[0].maxRow + 1) * cellSize;
        const seamGlow = ctx.createLinearGradient(0, seamY - 7, 0, seamY + 7);
        seamGlow.addColorStop(0, 'rgba(250, 246, 238, 0)');
        seamGlow.addColorStop(0.5, hexToRgba(palette.hudAccent, 0.42));
        seamGlow.addColorStop(1, 'rgba(250, 246, 238, 0)');
        ctx.fillStyle = seamGlow;
        ctx.fillRect(x, seamY - 7, width, 14);
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.72 + 0.16 * Math.sin(timeSec * 3.8);
        ctx.beginPath();
        ctx.moveTo(x, seamY);
        ctx.lineTo(x + width, seamY);
        ctx.stroke();

        // Subtle outward gravity chevrons from center seam
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5;
        for (const cx of [x + 10, x + width - 10]) {
          ctx.beginPath();
          ctx.moveTo(cx - 4, seamY - 5);
          ctx.lineTo(cx, seamY - 9);
          ctx.lineTo(cx + 4, seamY - 5);
          ctx.moveTo(cx - 4, seamY + 5);
          ctx.lineTo(cx, seamY + 9);
          ctx.lineTo(cx + 4, seamY + 5);
          ctx.stroke();
        }
      }

      if (board.activeShift === 'dual_screen' && board.wellRegions.length >= 2) {
        const lower = board.wellRegions[1];
        const hStart = lower.stagingMinRow ?? board.wellRegions[0].maxRow + 1;
        const hEnd = lower.stagingMaxRow ?? hStart + 1;
        const hy = y + hStart * cellSize;
        const hh = (hEnd - hStart + 1) * cellSize;
        ctx.fillStyle = 'rgba(22, 20, 32, 0.35)';
        ctx.fillRect(x, hy, width, hh);
        ctx.strokeStyle = palette.hudAccent;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, hy + 0.5);
        ctx.lineTo(x + width, hy + 0.5);
        ctx.moveTo(x, hy + hh - 0.5);
        ctx.lineTo(x + width, hy + hh - 0.5);
        ctx.stroke();
      }

      if (activeReg) {
        const rx = x + activeReg.minCol * cellSize;
        const ry = y + activeReg.minRow * cellSize;
        const rw = (activeReg.maxCol - activeReg.minCol + 1) * cellSize;
        const rh = (activeReg.maxRow - activeReg.minRow + 1) * cellSize;
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.38 + 0.16 * Math.pow(1 - beatPhase, 2);
        ctx.strokeRect(rx + 1, ry + 1, Math.max(2, rw - 2), Math.max(2, rh - 2));

        // Active well entrance stripe along spawn edge
        ctx.fillStyle = palette.hudAccent;
        ctx.globalAlpha = 0.65;
        if (activeReg.gravity === 'up') {
          ctx.fillRect(rx + 4, ry + rh - 3, Math.max(4, rw - 8), 3);
        } else {
          ctx.fillRect(rx + 4, ry, Math.max(4, rw - 8), 3);
        }
      }
      ctx.restore();
    }

    for (let i = 0; i < MAX_DROP_BEAMS; i++) {
      const beam = this.dropBeams[i];
      if (!beam.active || beam.boardIdx !== boardIdx) continue;
      const t = beam.life / beam.maxLife;
      const fade = (1 - t) * (1 - t);
      const dir = beam.gravityDirection ?? 'down';
      const botRows = beam.colBotRows;
      const colors = beam.colColors;

      if (dir === 'down') {
        const topY = y + Math.max(0, beam.startRow) * cellSize;
        for (let px = 0; px < botRows.length; px++) {
          const colBot = botRows[px];
          const colColor = colors[px];
          if (colBot < 0 || colColor === null || colColor === undefined) continue;
          const botY = y + Math.max(0, colBot + 1) * cellSize;
          if (botY <= topY) continue;
          const colX = x + (beam.col + px) * cellSize;
          const colStyle = getBlockStyle(palette, colColor);
          const grad = ctx.createLinearGradient(0, topY, 0, botY);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
          grad.addColorStop(0.65, colStyle.highlight);
          grad.addColorStop(1, palette.squareHighlight);
          ctx.save();
          ctx.globalAlpha = fade * 0.42;
          ctx.fillStyle = grad;
          ctx.fillRect(colX + 2, topY, Math.max(2, cellSize - 4), botY - topY);
          ctx.fillStyle = palette.squareHighlight;
          ctx.globalAlpha = fade * 0.72;
          ctx.fillRect(colX + 2, botY - 3, Math.max(2, cellSize - 4), 3);
          ctx.restore();
        }
      } else if (dir === 'up') {
        const botY = y + Math.min(boardRows, Math.max(1, beam.startRow + 1)) * cellSize;
        for (let px = 0; px < botRows.length; px++) {
          const colTop = botRows[px];
          const colColor = colors[px];
          if (colTop < 0 || colColor === null || colColor === undefined) continue;
          const topY = y + Math.max(0, colTop) * cellSize;
          if (botY <= topY) continue;
          const colX = x + (beam.col + px) * cellSize;
          const colStyle = getBlockStyle(palette, colColor);
          const grad = ctx.createLinearGradient(0, botY, 0, topY);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
          grad.addColorStop(0.65, colStyle.highlight);
          grad.addColorStop(1, palette.squareHighlight);
          ctx.save();
          ctx.globalAlpha = fade * 0.42;
          ctx.fillStyle = grad;
          ctx.fillRect(colX + 2, topY, Math.max(2, cellSize - 4), botY - topY);
          ctx.fillStyle = palette.squareHighlight;
          ctx.globalAlpha = fade * 0.72;
          ctx.fillRect(colX + 2, topY, Math.max(2, cellSize - 4), 3);
          ctx.restore();
        }
      } else if (dir === 'right') {
        const startX = x + Math.max(0, beam.col) * cellSize;
        for (let py = 0; py < botRows.length; py++) {
          const stopCol = botRows[py];
          const rowColor = colors[py];
          if (stopCol < 0 || rowColor === null || rowColor === undefined) continue;
          const endX = x + Math.max(0, stopCol + 1) * cellSize;
          if (endX <= startX) continue;
          const rowY = y + (beam.startRow + py) * cellSize;
          const colStyle = getBlockStyle(palette, rowColor);
          const grad = ctx.createLinearGradient(startX, 0, endX, 0);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
          grad.addColorStop(0.65, colStyle.highlight);
          grad.addColorStop(1, palette.squareHighlight);
          ctx.save();
          ctx.globalAlpha = fade * 0.42;
          ctx.fillStyle = grad;
          ctx.fillRect(startX, rowY + 2, endX - startX, Math.max(2, cellSize - 4));
          ctx.fillStyle = palette.squareHighlight;
          ctx.globalAlpha = fade * 0.72;
          ctx.fillRect(endX - 3, rowY + 2, 3, Math.max(2, cellSize - 4));
          ctx.restore();
        }
      } else if (dir === 'left') {
        const endX = x + Math.min(boardCols, Math.max(1, beam.col + 1)) * cellSize;
        for (let py = 0; py < botRows.length; py++) {
          const stopCol = botRows[py];
          const rowColor = colors[py];
          if (stopCol < 0 || rowColor === null || rowColor === undefined) continue;
          const startX = x + Math.max(0, stopCol) * cellSize;
          if (endX <= startX) continue;
          const rowY = y + (beam.startRow + py) * cellSize;
          const colStyle = getBlockStyle(palette, rowColor);
          const grad = ctx.createLinearGradient(endX, 0, startX, 0);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
          grad.addColorStop(0.65, colStyle.highlight);
          grad.addColorStop(1, palette.squareHighlight);
          ctx.save();
          ctx.globalAlpha = fade * 0.42;
          ctx.fillStyle = grad;
          ctx.fillRect(startX, rowY + 2, endX - startX, Math.max(2, cellSize - 4));
          ctx.fillStyle = palette.squareHighlight;
          ctx.globalAlpha = fade * 0.72;
          ctx.fillRect(startX, rowY + 2, 3, Math.max(2, cellSize - 4));
          ctx.restore();
        }
      }
    }

    const gravDir: GravityDirection = board.gravityDirection ?? 'down';
    if (gravDir !== 'down') {
      const flowPulse = 0.34 + 0.18 * Math.sin(timeSec * 4.2);
      ctx.save();
      ctx.strokeStyle = palette.hudAccent;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = flowPulse;
      if (gravDir === 'right') {
        for (let r = 1; r < boardRows; r += 2) {
          const cy = y + (r + 0.5) * cellSize;
          const cx = x + 9;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 5);
          ctx.lineTo(cx + 2, cy);
          ctx.lineTo(cx - 4, cy + 5);
          ctx.stroke();
        }
      } else if (gravDir === 'left') {
        for (let r = 1; r < boardRows; r += 2) {
          const cy = y + (r + 0.5) * cellSize;
          const cx = x + width - 9;
          ctx.beginPath();
          ctx.moveTo(cx + 4, cy - 5);
          ctx.lineTo(cx - 2, cy);
          ctx.lineTo(cx + 4, cy + 5);
          ctx.stroke();
        }
      } else if (gravDir === 'up') {
        for (let c = 1; c < boardCols; c += 3) {
          const cx = x + (c + 0.5) * cellSize;
          const cy = y + height - 9;
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy + 4);
          ctx.lineTo(cx, cy - 2);
          ctx.lineTo(cx + 5, cy + 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (board.activeShift === 'portal_wrap') {
      const portalPulse = 0.42 + 0.24 * Math.sin(timeSec * 4.5);
      ctx.save();
      ctx.fillStyle = palette.hudAccent;
      ctx.globalAlpha = portalPulse;
      if (gravDir === 'left' || gravDir === 'right') {
        ctx.fillRect(x, y, width, 3.5);
        ctx.fillRect(x, y + height - 3.5, width, 3.5);
      } else {
        ctx.fillRect(x, y, 3.5, height);
        ctx.fillRect(x + width - 3.5, y, 3.5, height);
      }
      ctx.restore();
    }

    if (board.activeShift === 'conveyor_floor') {
      const dirSign = board.conveyorDir === -1 ? -1 : 1;
      const beltY = y + height - Math.max(5, cellSize * 0.22);
      const beltH = Math.max(5, cellSize * 0.22);
      ctx.save();
      ctx.fillStyle = 'rgba(32, 28, 44, 0.26)';
      ctx.fillRect(x, beltY, width, beltH);
      ctx.strokeStyle = palette.hudAccent;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.72;
      const shiftPx = ((timeSec * 28 * dirSign) % cellSize + cellSize) % cellSize;
      for (let cx = x - cellSize + shiftPx; cx < x + width + cellSize; cx += cellSize * 0.7) {
        const my = beltY + beltH * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - dirSign * 3.5, my - 2.6);
        ctx.lineTo(cx + dirSign * 2.5, my);
        ctx.lineTo(cx - dirSign * 3.5, my + 2.6);
        ctx.stroke();
      }
      ctx.restore();
    }

    const isRtlSweep = board.activeShift === 'reverse_sweep';
    const isTwinSweep = board.activeShift === 'twin_sweep';
    const isSplitHalfSweep = board.activeShift === 'split_half_sweep';
    const isDiagonalSlantSweep = board.activeShift === 'diagonal_slant_sweep';
    const isDuelingBeams = board.activeShift === 'dueling_beams';
    const isSunMoon = board.activeShift === 'sun_moon';
    const isChromaticWells = board.activeShift === 'chromatic_wells';
    const isTrichromaSweep = board.activeShift === 'trichroma_beams';
    const isLighthouse = board.activeShift === 'lighthouse';

    const tlX = isRtlSweep ? x + (1 - timelineNorm) * width : x + timelineNorm * width;
    const twinNorm = (timelineNorm + 0.5) % 1;
    const tl2X = x + twinNorm * width;
    const duelingRtlX = x + (1 - timelineNorm) * width;
    const third1Cols = Math.max(1, Math.floor(boardCols / 3));
    const third2Cols = Math.max(2, Math.floor((boardCols * 2) / 3));
    const triNorm1 = (timelineNorm + third1Cols / Math.max(1, boardCols)) % 1;
    const triNorm2 = (timelineNorm + third2Cols / Math.max(1, boardCols)) % 1;
    const tlTri1X = x + triNorm1 * width;
    const tlTri2X = x + triNorm2 * width;

    const midSplitRow = Math.floor(boardRows / 2);
    const splitY = y + midSplitRow * cellSize;
    const slantCols = getDiagonalSlantSpan(boardCols);
    const slantNorm = slantCols / Math.max(1, boardCols);
    const slantBotNorm = ((timelineNorm - slantNorm) % 1 + 1) % 1;
    const activeSweepBonus = board.sweepState.squaresThisSweep > 0 ? 0.35 : 0;
    const glowW = cellSize * (3.15 + activeSweepBonus * 0.9 + subBass * 0.9);
    const activeBeamColA = isRtlSweep
      ? Math.max(0, boardCols - 1 - (Math.floor(timelineNorm * boardCols) % boardCols))
      : Math.floor(timelineNorm * boardCols) % boardCols;
    const activeBeamColB = isDuelingBeams
      ? Math.max(0, boardCols - 1 - activeBeamColA)
      : Math.floor(twinNorm * boardCols) % boardCols;
    let beamColsForProx: number[];
    if (isTrichromaSweep) {
      this.tmpBeamCols3[0] = activeBeamColA;
      this.tmpBeamCols3[1] = (activeBeamColA + third1Cols) % boardCols;
      this.tmpBeamCols3[2] = (activeBeamColA + third2Cols) % boardCols;
      beamColsForProx = this.tmpBeamCols3;
    } else if (isTwinSweep || isSplitHalfSweep || isDuelingBeams) {
      this.tmpBeamCols2[0] = activeBeamColA;
      this.tmpBeamCols2[1] = activeBeamColB;
      beamColsForProx = this.tmpBeamCols2;
    } else {
      this.tmpBeamCols1[0] = activeBeamColA;
      beamColsForProx = this.tmpBeamCols1;
    }

    const sunMoonActiveColor = ((board.sweepPassCount ?? 0) % 2) as CellColor;
    const chromaticFlip = Math.floor((board.sweepPassCount ?? 0) / 2) % 2;
    const chromaticLeftMax =
      board.wellRegions?.[0]?.maxCol ?? Math.floor(boardCols / 2) - 2;
    const chromaticRightMin =
      board.wellRegions?.[1]?.minCol ?? Math.floor(boardCols / 2) + 1;
    const chromaticActiveColor: CellColor | null = !isChromaticWells
      ? null
      : activeBeamColA <= chromaticLeftMax
      ? (chromaticFlip as CellColor)
      : activeBeamColA >= chromaticRightMin
      ? ((1 - chromaticFlip) as CellColor)
      : null;

    const lighthouseColorIdx = ((board.sweepPassCount ?? 0) % (board.colorCount || 2)) as CellColor;
    const lighthouseStyle = getBlockStyle(palette, lighthouseColorIdx);
    const lighthouseAngle =
      board.lighthouseAngle ??
      (Math.PI + 0.06) * (1 - timelineNorm) - 0.06 * timelineNorm;

    const drawSweepWakeBand = (
      beamX: number,
      rtl: boolean,
      topY: number,
      bandH: number,
      tintHex?: string
    ) => {
      const wakeStart = rtl ? beamX + glowW : beamX - glowW;
      const glowGrad = ctx.createLinearGradient(wakeStart, 0, beamX, 0);
      const glowTone = tintHex ? hexToRgba(tintHex, 0.34) : palette.timelineGlow;
      glowGrad.addColorStop(0, 'rgba(250, 246, 238, 0)');
      glowGrad.addColorStop(0.55, glowTone);
      glowGrad.addColorStop(1, glowTone);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(rtl ? beamX : beamX - glowW, topY, glowW, bandH);

      ctx.save();
      ctx.strokeStyle = tintHex ?? palette.squareHighlight;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.26 + Math.pow(1 - beatPhase, 2.2) * 0.12;
      ctx.beginPath();
      const segs = Math.max(6, Math.round((bandH / Math.max(1, height)) * 14));
      for (let step = 0; step <= segs; step++) {
        const sy = topY + (step / segs) * bandH;
        const sx = beamX + (rtl ? 2 : -2) + Math.sin(timeSec * 3.8 + step * 0.8) * 1.4;
        if (step === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    };

    const drawSlantWakeSegment = (
      topNorm: number,
      botNorm: number,
      segTopY: number,
      segBotY: number
    ) => {
      const topX = x + topNorm * width;
      const botX = x + botNorm * width;
      const midX = (topX + botX) * 0.5;
      const grad = ctx.createLinearGradient(midX - glowW, 0, midX, 0);
      grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
      grad.addColorStop(0.55, palette.timelineGlow);
      grad.addColorStop(1, palette.timelineGlow);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topX - glowW, segTopY);
      ctx.lineTo(topX, segTopY);
      ctx.lineTo(botX, segBotY);
      ctx.lineTo(botX - glowW, segBotY);
      ctx.closePath();
      ctx.fill();
    };

    if (isLighthouse) {
      const originX = x + width * 0.5;
      const originY = y + height;
      const reach = Math.hypot(width, height) * 1.15;
      const halfCone = 0.16;
      const a0 = lighthouseAngle - halfCone;
      const a1 = lighthouseAngle + halfCone;
      const coneGrad = ctx.createRadialGradient(originX, originY, 6, originX, originY, reach);
      coneGrad.addColorStop(0, hexToRgba(lighthouseStyle.highlight, 0.34));
      coneGrad.addColorStop(0.55, hexToRgba(lighthouseStyle.fill, 0.16));
      coneGrad.addColorStop(1, hexToRgba(lighthouseStyle.fill, 0.02));
      ctx.save();
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + Math.cos(a0) * reach, originY - Math.sin(a0) * reach);
      ctx.lineTo(originX + Math.cos(a1) * reach, originY - Math.sin(a1) * reach);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (isSplitHalfSweep) {
      drawSweepWakeBand(tlX, false, y, splitY - y);
      drawSweepWakeBand(tl2X, false, splitY, y + height - splitY);
      ctx.save();
      ctx.strokeStyle = palette.timelineBeam;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.28 + Math.pow(1 - beatPhase, 2.5) * 0.18;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(x, splitY);
      ctx.lineTo(x + width, splitY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (isDiagonalSlantSweep) {
      const uTop = timelineNorm;
      const uBot = timelineNorm - slantNorm;
      if (uBot >= 0) {
        drawSlantWakeSegment(uTop, uBot, y, y + height);
      } else {
        const wrapT = Math.min(1, Math.max(0, uTop / Math.max(0.001, slantNorm)));
        const wrapY = y + wrapT * height;
        drawSlantWakeSegment(uTop, 0, y, wrapY);
        drawSlantWakeSegment(1, 1 + uBot, wrapY, y + height);
      }
    } else if (isDuelingBeams) {
      drawSweepWakeBand(tlX, false, y, height, palette.blockA.fill);
      drawSweepWakeBand(duelingRtlX, true, y, height, palette.blockB.fill);
    } else if (isTrichromaSweep) {
      drawSweepWakeBand(tlX, false, y, height, palette.blockA.fill);
      drawSweepWakeBand(tlTri1X, false, y, height, palette.blockB.fill);
      drawSweepWakeBand(tlTri2X, false, y, height, palette.blockC.fill);
    } else if (isSunMoon) {
      drawSweepWakeBand(tlX, false, y, height, getBlockStyle(palette, sunMoonActiveColor).fill);
    } else if (isChromaticWells && chromaticActiveColor !== null) {
      drawSweepWakeBand(
        tlX,
        false,
        y,
        height,
        getBlockStyle(palette, chromaticActiveColor).fill
      );
    } else {
      drawSweepWakeBand(tlX, isRtlSweep, y, height);
      if (isTwinSweep) {
        drawSweepWakeBand(tl2X, false, y, height);
      }
    }

    if (board.activeShift === 'rising_tide') {
      const tideRows = board.risingTideRows ?? 0;
      const creep = board.sweepState.squaresThisSweep >= 4 ? 0 : timelineNorm * 0.42;
      const tideH = Math.min(height * 0.48, Math.max(cellSize * 0.22, (tideRows + creep) * cellSize * 0.55));
      const waterTopY = y + height - tideH;
      const waterGrad = ctx.createLinearGradient(0, waterTopY, 0, y + height);
      waterGrad.addColorStop(0, 'rgba(92, 188, 206, 0.26)');
      waterGrad.addColorStop(1, 'rgba(42, 118, 148, 0.42)');
      ctx.save();
      ctx.fillStyle = waterGrad;
      ctx.beginPath();
      ctx.moveTo(x, y + height);
      for (let step = 0; step <= 16; step++) {
        const wx = x + (step / 16) * width;
        const wy = waterTopY + Math.sin(timeSec * 3.4 + step * 0.65) * 2.2;
        ctx.lineTo(wx, wy);
      }
      ctx.lineTo(x + width, y + height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#d9f6fb';
      ctx.globalAlpha = 0.68;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let step = 0; step <= 16; step++) {
        const wx = x + (step / 16) * width;
        const wy = waterTopY + Math.sin(timeSec * 3.4 + step * 0.65) * 2.2;
        if (step === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (board.activeShift === 'ceiling_press') {
      const lockRows = board.ceilingLockRows ?? 0;
      const nextStepPreview = board.sweepState.squaresThisSweep < 4 && lockRows < 3 ? timelineNorm * 0.35 : 0;
      const pressY = y + (lockRows + nextStepPreview) * cellSize;
      const spawnCol = Math.max(0, Math.floor((boardCols - 2) / 2));
      const leftStopX = x + spawnCol * cellSize;
      const rightStartX = x + (spawnCol + 2) * cellSize;
      ctx.save();
      ctx.strokeStyle = palette.hudAccent;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([5, 4]);
      if (leftStopX > x) {
        ctx.beginPath();
        ctx.moveTo(x, pressY);
        ctx.lineTo(leftStopX, pressY);
        ctx.stroke();
      }
      if (rightStartX < x + width) {
        ctx.beginPath();
        ctx.moveTo(rightStartX, pressY);
        ctx.lineTo(x + width, pressY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    const activePiece = board.activePiece && !board.isGameOver ? board.activePiece : null;
    const activePieceGravDir: GravityDirection = getActiveGravityDirection(board);
    const { gx: gVecX, gy: gVecY } = getGravityVector(activePieceGravDir);
    const subStepOffset =
      activePiece &&
      board.orientationGraceTimer <= 0 &&
      canPlacePiece(board, activePiece, gVecX, gVecY)
        ? Math.min(0.95, Math.max(0, board.gravityAccum))
        : 0;
    const logicalVisualX = activePiece ? activePiece.x + gVecX * subStepOffset : 0;
    const logicalVisualY = activePiece ? activePiece.y + gVecY * subStepOffset : 0;
    let smoothPieceX = logicalVisualX;
    let smoothPieceY = logicalVisualY;
    const ps = this.pieceSmooth[boardIdx];
    if (activePiece) {
      const prevCells = ps.pieceRef?.cells;
      const spawnReset =
        prevCells !== undefined &&
        prevCells !== activePiece.cells &&
        Math.abs(ps.rotAngle) < 0.01 &&
        (activePieceGravDir === 'up'
          ? logicalVisualY > ps.smoothY + 1
          : logicalVisualY < ps.smoothY - 1 || Math.abs(logicalVisualX - ps.smoothX) > 2.2);
      const wrapJump =
        Math.abs(logicalVisualX - ps.smoothX) > 2.2 ||
        Math.abs(logicalVisualY - ps.smoothY) > 2.2;
      if (ps.pieceRef === null || spawnReset || wrapJump || this.reducedMotion) {
        ps.pieceRef = activePiece;
        ps.smoothX = logicalVisualX;
        ps.smoothY = logicalVisualY;
        if (ps.pieceRef === null || spawnReset) ps.rotAngle = 0;
      } else {
        ps.pieceRef = activePiece;
        const damp = 1 - Math.exp(-Math.max(0.001, this.lastFrameDt) / 0.045);
        ps.smoothX += (logicalVisualX - ps.smoothX) * damp;
        if (activePieceGravDir === 'left' || activePieceGravDir === 'right') {
          ps.smoothY += (logicalVisualY - ps.smoothY) * damp;
        } else {
          ps.smoothY = logicalVisualY;
        }
      }
      smoothPieceX = ps.smoothX;
      smoothPieceY = ps.smoothY;
    } else {
      ps.pieceRef = null;
      ps.rotAngle = 0;
    }

    if (activePiece) {
      this.drawGhostPiece(
        ctx,
        x,
        y,
        cellSize,
        board,
        activePiece,
        skin,
        logicalVisualX,
        logicalVisualY,
        beatPhase
      );
    }

    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        const cell = board.grid[r][c];
        if (!cell) continue;
        const ax = cell.animOffsetX ?? 0;
        const ay = cell.animOffsetY ?? 0;
        const hopLift = Math.min(1.6, Math.abs(ax) * 0.36);
        this.writeNeighborRipple(boardIdx, c, r, this.tmpRipple);
        const drawX = x + (c + ax) * cellSize;
        const drawY = y + (r - cell.fallOffset - ay - hopLift) * cellSize - this.tmpRipple.liftPx;

        if (cell.isObstacle) {
          this.drawObstacleCell(
            ctx,
            drawX,
            drawY,
            cellSize,
            cell,
            board,
            skin,
            timeSec,
            beatPhase,
            r,
            c
          );
          continue;
        }

        if (cell.fallOffset > 1.15) {
          const streakH = Math.min(cell.fallOffset, 3) * cellSize * 0.38;
          const style = getBlockStyle(palette, cell.color);
          ctx.save();
          ctx.fillStyle = style.highlight;
          ctx.globalAlpha = 0.2;
          ctx.fillRect(drawX + 2, drawY - streakH, cellSize - 4, streakH);
          ctx.restore();
        }

        const settledForMarks =
          cell.fallOffset <= 0.15 && Math.abs(ax) <= 0.12 && Math.abs(ay) <= 0.12;
        this.writeGridCellJoins(board.grid, r, c, cell, this.tmpJoins);
        const beamProx = computeBeamProximity(
          c,
          beamColsForProx,
          boardCols,
          isRtlSweep,
          4
        );
        this.tmpBlockFx.row = r;
        this.tmpBlockFx.col = c;
        this.tmpBlockFx.inSquare = cell.inSquare && settledForMarks;
        this.tmpBlockFx.chainMarked = cell.chainMarked;
        this.tmpBlockFx.pendingClear = cell.pendingClear;
        this.tmpBlockFx.sweptCol = cell.sweptCol;
        this.tmpBlockFx.landFlash = cell.landFlash;
        this.tmpBlockFx.rippleGlow = this.tmpRipple.glow;
        this.tmpBlockFx.beatPhase = beatPhase;
        this.tmpBlockFx.timeSec = timeSec;
        this.tmpBlockFx.shimmerWave =
          cell.inSquare && settledForMarks
            ? Math.min(1, 0.22 + beamProx * 0.78)
            : beamProx > 0.25 && (cell.chainMarked || cell.pendingClear)
            ? beamProx * 0.55
            : 0;
        this.tmpBlockFx.isWild = Boolean(cell.isWild);
        this.tmpBlockFx.isCrashGem = Boolean(cell.isCrashGem);
        this.tmpBlockFx.frostHp = cell.frostHp ?? 0;
        this.tmpBlockFx.isVirus = Boolean(cell.isVirus);
        this.tmpBlockFx.patternMode = this.patternMode;
        this.drawBlockCell(
          ctx,
          drawX,
          drawY,
          cellSize,
          cell.color,
          cell.isChain,
          skin,
          this.tmpJoins,
          this.tmpBlockFx
        );
      }
    }

    for (let i = 0; i < MAX_GHOST_CLEARS; i++) {
      const gc = this.ghostClears[i];
      if (!gc.active || gc.boardIdx !== boardIdx || gc.delay > 0) continue;
      const t = Math.min(1, gc.life / Math.max(0.01, gc.maxLife));
      const popScale =
        t < 0.28
          ? 1 + (t / 0.28) * 0.12
          : 1.12 * Math.max(0, 1 - (t - 0.28) / 0.72);
      if (popScale <= 0.02) continue;
      const gcx = x + (gc.gx + 0.5) * cellSize;
      const gcy = y + (gc.gy + 0.5) * cellSize;
      ctx.save();
      ctx.translate(gcx, gcy);
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = Math.max(0, 1 - t * 0.85);
      this.tmpJoins.top = false;
      this.tmpJoins.right = false;
      this.tmpJoins.bottom = false;
      this.tmpJoins.left = false;
      this.tmpBlockFx.row = gc.gy;
      this.tmpBlockFx.col = gc.gx;
      this.tmpBlockFx.inSquare = false;
      this.tmpBlockFx.chainMarked = false;
      this.tmpBlockFx.pendingClear = false;
      this.tmpBlockFx.sweptCol = false;
      this.tmpBlockFx.landFlash = 0;
      this.tmpBlockFx.rippleGlow = 0;
      this.tmpBlockFx.beatPhase = beatPhase;
      this.tmpBlockFx.timeSec = timeSec;
      this.tmpBlockFx.shimmerWave = 0;
      this.tmpBlockFx.isWild = false;
      this.tmpBlockFx.isCrashGem = false;
      this.tmpBlockFx.frostHp = 0;
      this.tmpBlockFx.isVirus = false;
      this.tmpBlockFx.patternMode = this.patternMode;
      this.drawBlockCell(
        ctx,
        -cellSize * 0.5,
        -cellSize * 0.5,
        cellSize,
        gc.color,
        false,
        skin,
        this.tmpJoins,
        this.tmpBlockFx
      );
      if (t < 0.45) {
        ctx.fillStyle = '#faf6ee';
        ctx.globalAlpha = (1 - t / 0.45) * 0.82;
        this.roundRect(
          ctx,
          -cellSize * 0.5,
          -cellSize * 0.5,
          cellSize,
          cellSize,
          Math.max(2, cellSize * 0.14)
        );
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = '#faf6ee';
    ctx.lineWidth = Math.max(1.8, cellSize * 0.06);
    ctx.globalAlpha = 0.52 + 0.25 * Math.sin(timeSec * 7);
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        const cell = board.grid[r][c];
        if (!cell || !cell.chainMarked) continue;
        const cx = x + (c + 0.5 + (cell.animOffsetX ?? 0)) * cellSize;
        const cy = y + (r + 0.5 - (cell.animOffsetY ?? 0)) * cellSize;
        const rightCell = c + 1 < boardCols ? board.grid[r][c + 1] : null;
        if (
          rightCell?.chainMarked &&
          (cell.isWild || rightCell.isWild || rightCell.color === cell.color)
        ) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + cellSize, cy);
          ctx.stroke();
        }
        const downCell = r + 1 < boardRows ? board.grid[r + 1][c] : null;
        if (
          downCell?.chainMarked &&
          (cell.isWild || downCell.isWild || downCell.color === cell.color)
        ) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy + cellSize);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    const beatPulse = Math.pow(1 - beatPhase, 2.5);
    const isSettledCell = (cell: Cell | null) =>
      cell !== null &&
      cell.fallOffset <= 0.15 &&
      Math.abs(cell.animOffsetX ?? 0) <= 0.12 &&
      Math.abs(cell.animOffsetY ?? 0) <= 0.12;

    for (const sq of board.squares) {
      if (sq.y + 1 >= boardRows || sq.x + 1 >= boardCols) continue;
      const c00 = board.grid[sq.y][sq.x];
      const c01 = board.grid[sq.y][sq.x + 1];
      const c10 = board.grid[sq.y + 1][sq.x];
      const c11 = board.grid[sq.y + 1][sq.x + 1];
      if (!isSettledCell(c00) || !isSettledCell(c01) || !isSettledCell(c10) || !isSettledCell(c11)) {
        continue;
      }
      const cx = x + (sq.x + 1) * cellSize;
      const cy = y + (sq.y + 1) * cellSize;
      const pulse = 0.78 + 0.22 * Math.sin(timeSec * 5.2 + sq.x * 0.4);
      const gemR = cellSize * (0.21 + beatPulse * 0.06);
      const rot = Math.sin(timeSec * 2.1 + sq.x * 0.5) * 0.22;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = palette.squareHighlight;
      this.drawDiamond(ctx, 0, 0, gemR);
      ctx.strokeStyle = getBlockStyle(palette, sq.color).border;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      if (beatPulse > 0.25) {
        ctx.strokeStyle = '#faf6ee';
        ctx.globalAlpha = beatPulse * 0.72;
        ctx.lineWidth = 1.1;
        const flareR = gemR * (1.25 + beatPulse * 0.35);
        ctx.beginPath();
        ctx.moveTo(-flareR, 0);
        ctx.lineTo(flareR, 0);
        ctx.moveTo(0, -flareR);
        ctx.lineTo(0, flareR);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = palette.squareHighlight;
    ctx.lineWidth = Math.max(2, cellSize * 0.085);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        const cell = board.grid[r][c];
        if (!cell || !cell.inSquare || !isSettledCell(cell)) continue;
        const bx = x + c * cellSize;
        const by = y + r * cellSize;
        const color = cell.color;
        if (r === 0 || !board.grid[r - 1][c]?.inSquare || board.grid[r - 1][c]?.color !== color || !isSettledCell(board.grid[r - 1][c])) {
          ctx.moveTo(bx + 1, by + 1);
          ctx.lineTo(bx + cellSize - 1, by + 1);
        }
        if (r + 1 >= boardRows || !board.grid[r + 1][c]?.inSquare || board.grid[r + 1][c]?.color !== color || !isSettledCell(board.grid[r + 1][c])) {
          ctx.moveTo(bx + 1, by + cellSize - 1);
          ctx.lineTo(bx + cellSize - 1, by + cellSize - 1);
        }
        if (c === 0 || !board.grid[r][c - 1]?.inSquare || board.grid[r][c - 1]?.color !== color || !isSettledCell(board.grid[r][c - 1])) {
          ctx.moveTo(bx + 1, by + 1);
          ctx.lineTo(bx + 1, by + cellSize - 1);
        }
        if (c + 1 >= boardCols || !board.grid[r][c + 1]?.inSquare || board.grid[r][c + 1]?.color !== color || !isSettledCell(board.grid[r][c + 1])) {
          ctx.moveTo(bx + cellSize - 1, by + 1);
          ctx.lineTo(bx + cellSize - 1, by + cellSize - 1);
        }
      }
    }
    ctx.stroke();
    ctx.restore();

    if (board.shiftEffect && board.shiftEffect.life > 0) {
      const fx = board.shiftEffect;
      const frac = Math.min(1, Math.max(0, fx.life / Math.max(0.01, fx.maxLife)));
      ctx.save();
      if (fx.type === 'horizon_shear' && typeof fx.faultRow === 'number') {
        const seamY = y + fx.faultRow * cellSize;
        const beamH = Math.max(4, cellSize * 0.32);
        const grad = ctx.createLinearGradient(0, seamY - beamH, 0, seamY + beamH);
        grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
        grad.addColorStop(0.5, palette.hudAccent);
        grad.addColorStop(1, 'rgba(250, 246, 238, 0)');
        ctx.globalAlpha = frac * 0.85;
        ctx.fillStyle = grad;
        ctx.fillRect(x, seamY - beamH, width, beamH * 2);

        ctx.strokeStyle = '#faf6ee';
        ctx.lineWidth = 2;
        ctx.globalAlpha = frac * 0.95;
        ctx.beginPath();
        ctx.moveTo(x, seamY);
        ctx.lineTo(x + width, seamY);
        ctx.stroke();
      } else if (fx.type === 'line_color_shift' && fx.lineCells) {
        ctx.strokeStyle = palette.squareHighlight;
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = frac * 0.85;
        for (const pos of fx.lineCells) {
          const cx = x + pos.c * cellSize + 1.5;
          const cy = y + pos.r * cellSize + 1.5;
          ctx.strokeRect(cx, cy, Math.max(2, cellSize - 3), Math.max(2, cellSize - 3));
        }
      } else if (fx.type === 'mirror_flip') {
        const mx = x + (fx.mirrorCol ?? boardCols * 0.5) * cellSize;
        const grad = ctx.createLinearGradient(mx - 12, 0, mx + 12, 0);
        grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
        grad.addColorStop(0.5, palette.squareHighlight);
        grad.addColorStop(1, 'rgba(250, 246, 238, 0)');
        ctx.globalAlpha = frac * 0.9;
        ctx.fillStyle = grad;
        ctx.fillRect(mx - 12, y, 24, height);
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, y);
        ctx.lineTo(mx, y + height);
        ctx.stroke();
      } else if (fx.type === 'shell_game') {
        const mx = x + (fx.mirrorCol ?? boardCols * 0.5) * cellSize;
        const spanX = Math.max(cellSize * 2, width * 0.28);
        const midY = y + height * 0.5;
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = frac * 0.78;
        ctx.beginPath();
        ctx.moveTo(mx - spanX, midY - height * 0.22);
        ctx.quadraticCurveTo(mx, y + height * 0.08, mx + spanX, midY - height * 0.22);
        ctx.moveTo(mx + spanX, midY + height * 0.22);
        ctx.quadraticCurveTo(mx, y + height * 0.92, mx - spanX, midY + height * 0.22);
        ctx.stroke();

        ctx.strokeStyle = palette.squareHighlight;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = frac * 0.85;
        ctx.beginPath();
        ctx.moveTo(mx, y);
        ctx.lineTo(mx, y + height);
        ctx.stroke();
      } else if (fx.type === 'vortex_swirl' || fx.type === 'cyclotron_flow') {
        // Outer perimeter orbital pulse outside the playfield so blocks stay 100% unobstructed
        ctx.restore();
        ctx.save();
        const pad = 9 + (1 - frac) * 6;
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 2.6;
        ctx.globalAlpha = frac * 0.72;
        this.roundRect(ctx, x - pad, y - pad, width + pad * 2, height + pad * 2, 14);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.shiftFlashT > 0 && boardIdx === 0) {
      const flashCol =
        this.shiftFlashPolarity === 'boon'
          ? '#3db87a'
          : this.shiftFlashPolarity === 'bane'
          ? '#e05b5b'
          : palette.hudAccent;
      ctx.save();
      ctx.strokeStyle = flashCol;
      ctx.lineWidth = Math.max(4, cellSize * 0.24);
      ctx.globalAlpha = this.shiftFlashT * 0.72;
      ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
      ctx.fillStyle = flashCol;
      ctx.globalAlpha = this.shiftFlashT * 0.14;
      ctx.fillRect(x, y, width, height);
      ctx.restore();
    }

    ctx.restore();

    const sweepBeats = getSweepBeatsForShift(board.activeShift);
    const activeBeatCol = isRtlSweep
      ? Math.max(0, boardCols - 1 - (Math.floor(timelineNorm * boardCols) % boardCols))
      : Math.floor(timelineNorm * boardCols) % boardCols;
    const activeBeatCol2 = isTwinSweep
      ? Math.floor(twinNorm * boardCols) % boardCols
      : isDuelingBeams
      ? Math.max(0, boardCols - 1 - activeBeatCol)
      : -1;
    const activeBeatColBot = isSplitHalfSweep
      ? Math.floor(twinNorm * boardCols) % boardCols
      : isDiagonalSlantSweep
      ? Math.floor(slantBotNorm * boardCols) % boardCols
      : activeBeatCol;
    const isSkyDark = isHexColorDark(palette.skyMid);
    const barStride = boardCols >= 16 ? 4 : 2;
    const isRisingTide = board.activeShift === 'rising_tide';

    if (!isLighthouse) {
      ctx.save();
      const activeRulerTick = Math.floor(timelineNorm * sweepBeats) % sweepBeats;
      for (let bt = 0; bt < sweepBeats; bt++) {
        const normX = (bt + 0.5) / sweepBeats;
        const rx = isRtlSweep ? x + (1 - normX) * width : x + normX * width;
        const isCurTick = bt === activeRulerTick;
        ctx.strokeStyle = isCurTick ? palette.hudAccent : palette.timelineBeam;
        ctx.globalAlpha = isCurTick ? 0.92 : bt % 4 === 0 ? 0.5 : 0.24;
        ctx.lineWidth = isCurTick ? 2 : 1.1;
        ctx.beginPath();
        ctx.moveTo(rx, y - 5);
        ctx.lineTo(rx, y - (bt % 4 === 0 ? 9 : 7));
        ctx.stroke();
      }
      if (sweepBeats !== 8 && !label) {
        const rateBadge = sweepBeats === 4 ? '4×' : '16×';
        ctx.fillStyle = palette.timelineBeam;
        this.roundRect(ctx, x + 2, y - 28, 28, 15, 4);
        ctx.fill();
        ctx.fillStyle = '#faf6ee';
        ctx.font = '700 9.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rateBadge, x + 16, y - 20.5);
      }

      for (let c = 0; c < boardCols; c++) {
        const dx = x + (c + 0.5) * cellSize;
        const dy = y - 13;
        const isActiveColTop = c === activeBeatCol || c === activeBeatCol2;
        const isActiveColBot =
          c === activeBeatColBot || (isTwinSweep && c === activeBeatCol2) || (isDuelingBeams && c === activeBeatCol2);
        const isDownbeat = c % barStride === 0;
        ctx.fillStyle = isActiveColTop ? palette.hudAccent : palette.timelineBeam;
        ctx.globalAlpha = isActiveColTop ? 0.94 : isDownbeat ? 0.38 : 0.18;
        this.drawDiamond(
          ctx,
          dx,
          dy,
          isActiveColTop ? 3.8 + beatPulse * 1.1 : isDownbeat ? 2.6 : 1.9
        );

        if (c % Math.max(2, Math.floor(boardCols / 4)) === 0 && !label) {
          const measureNum = Math.floor(c / Math.max(2, Math.floor(boardCols / 4))) + 1;
          const activeMeasure = Math.floor(activeBeatCol / Math.max(2, Math.floor(boardCols / 4))) + 1;
          const isCurrMeasure = measureNum === activeMeasure;
          if (!(sweepBeats !== 8 && c === 0)) {
            const fallbackMeasureInk =
              getWcagContrast('#faf7f2', palette.skyMid) >=
              getWcagContrast(palette.hudInk, palette.skyMid)
                ? '#faf7f2'
                : palette.hudInk;
            ctx.fillStyle = isCurrMeasure
              ? palette.hudAccent
              : isSkyDark
              ? '#faf7f2'
              : fallbackMeasureInk;
            ctx.globalAlpha = isCurrMeasure ? 0.92 : 0.56;
            ctx.font = '600 9.5px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${measureNum}`, dx, y - 22);
          }
        }

        if (isRisingTide) {
          const tideCount = board.colorCount ?? 2;
          const previewColor = ((c + (board.risingTideRows ?? 0)) % tideCount) as CellColor;
          const previewStyle = getBlockStyle(palette, previewColor);
          const pw = Math.max(3, cellSize - 3);
          const ph = Math.max(5, Math.min(8, cellSize * 0.22));
          ctx.fillStyle = previewStyle.fill;
          ctx.globalAlpha = 0.65 + 0.2 * Math.sin(timeSec * 4 + c * 0.4);
          this.roundRect(ctx, x + c * cellSize + 1.5, y + height + 2.5, pw, ph, 1.5);
          ctx.fill();
        }

        let colHasMarks = false;
        for (let r = 0; r < boardRows; r++) {
          const cell = board.grid[r][c];
          if (cell && (cell.inSquare || cell.chainMarked)) {
            colHasMarks = true;
            break;
          }
        }
        const distCols = Math.min(
          Math.abs(c - activeBeatColBot),
          boardCols - Math.abs(c - activeBeatColBot)
        );
        const waveBar = Math.max(0, 1 - distCols / 3) * (0.45 + beatPulse * 0.55);
        const bandIdx = bands && bands.length > 0
          ? Math.min(bands.length - 1, Math.floor((c / Math.max(1, boardCols)) * bands.length))
          : -1;
        const colSpectrum =
          bandIdx >= 0 && bands
            ? bands[bandIdx]
            : c < boardCols * 0.33
            ? subBass
            : c < boardCols * 0.67
            ? mid
            : high;
        const tickH =
          2.5 + (colHasMarks ? 3.8 : 0) + waveBar * 3.8 + colSpectrum * 7.2;
        const tickTopY = isRisingTide ? y + height + 12 : y + height + 9;
        ctx.fillStyle = colHasMarks || isActiveColBot ? palette.hudAccent : palette.timelineBeam;
        ctx.globalAlpha = colHasMarks
          ? 0.72 + colSpectrum * 0.24
          : isActiveColBot
          ? 0.85
          : 0.22 + colSpectrum * 0.44;
        ctx.fillRect(dx - cellSize * 0.22, tickTopY, cellSize * 0.44, tickH);
      }
      ctx.restore();
    }

    if (activePiece) {
      const pieceRows = activePiece.cells.length;
      const pieceCols = activePiece.cells[0]?.length ?? 2;
      const lockProgress =
        board.lockTimer > 0
          ? Math.min(1, board.lockTimer / Math.max(0.15, board.activeLockDelaySec ?? LOCK_DELAY_SEC))
          : 0;

      const suppressTopRails =
        board.activeShift === 'dual_screen' || board.activeShift === 'clamshell';
      if (!suppressTopRails && activePieceGravDir === 'down' && smoothPieceY < 0) {
        ctx.save();
        ctx.strokeStyle = palette.boardFrame;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x + 4, y - cellSize);
        ctx.lineTo(x + width - 4, y - cellSize);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const leftRailX = x + smoothPieceX * cellSize;
        const rightRailX = x + (smoothPieceX + pieceCols) * cellSize;
        const topRailY = y + smoothPieceY * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, topRailY);
        ctx.lineTo(leftRailX, y);
        ctx.moveTo(rightRailX, topRailY);
        ctx.lineTo(rightRailX, y);
        ctx.stroke();
        ctx.restore();
      } else if (!suppressTopRails && activePieceGravDir === 'up' && smoothPieceY + pieceRows > boardRows) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const leftRailX = x + smoothPieceX * cellSize;
        const rightRailX = x + (smoothPieceX + pieceCols) * cellSize;
        const botRailY = y + (smoothPieceY + pieceRows) * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, y + height);
        ctx.lineTo(leftRailX, botRailY);
        ctx.moveTo(rightRailX, y + height);
        ctx.lineTo(rightRailX, botRailY);
        ctx.stroke();
        ctx.restore();
      } else if (activePieceGravDir === 'right' && smoothPieceX < 0) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const topRailY = y + smoothPieceY * cellSize;
        const botRailY = y + (smoothPieceY + pieceRows) * cellSize;
        const leftRailX = x + smoothPieceX * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, topRailY);
        ctx.lineTo(x, topRailY);
        ctx.moveTo(leftRailX, botRailY);
        ctx.lineTo(x, botRailY);
        ctx.stroke();
        ctx.restore();
      } else if (activePieceGravDir === 'left' && smoothPieceX + pieceCols > boardCols) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const topRailY = y + smoothPieceY * cellSize;
        const botRailY = y + (smoothPieceY + pieceRows) * cellSize;
        const rightRailX = x + (smoothPieceX + pieceCols) * cellSize;
        ctx.beginPath();
        ctx.moveTo(x + width, topRailY);
        ctx.lineTo(rightRailX, topRailY);
        ctx.moveTo(x + width, botRailY);
        ctx.lineTo(rightRailX, botRailY);
        ctx.stroke();
        ctx.restore();
      }

      const pieceCx = x + (smoothPieceX + pieceCols * 0.5) * cellSize;
      const pieceCy = y + (smoothPieceY + pieceRows * 0.5) * cellSize;

      if (board.activeShift === 'metronome_charge') {
        const wrappedBeat = ((beatPhase % 1) + 1) % 1;
        const distToBeat = Math.min(wrappedBeat, 1 - wrappedBeat);
        const inBeatWindow = distToBeat <= 0.2;
        const bx = x + smoothPieceX * cellSize - 3;
        const by = y + smoothPieceY * cellSize - 3;
        const bw = pieceCols * cellSize + 6;
        const bh = pieceRows * cellSize + 6;
        const arm = Math.max(5, cellSize * 0.28);
        ctx.save();
        ctx.strokeStyle = inBeatWindow ? '#3db87a' : palette.hudAccent;
        ctx.lineWidth = inBeatWindow ? 2.4 : 1.4;
        ctx.globalAlpha = inBeatWindow ? 0.88 : 0.35;
        ctx.beginPath();
        ctx.moveTo(bx, by + arm); ctx.lineTo(bx, by); ctx.lineTo(bx + arm, by);
        ctx.moveTo(bx + bw - arm, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + arm);
        ctx.moveTo(bx, by + bh - arm); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + arm, by + bh);
        ctx.moveTo(bx + bw - arm, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - arm);
        ctx.stroke();
        ctx.restore();
      }

      const hasRotTween = !this.reducedMotion && Math.abs(ps.rotAngle) > 0.004;
      ctx.save();
      if (hasRotTween) {
        ctx.translate(pieceCx, pieceCy);
        ctx.rotate(ps.rotAngle);
      }
      for (let py = 0; py < pieceRows; py++) {
        for (let px = 0; px < pieceCols; px++) {
          const pCell = activePiece.cells[py]?.[px];
          if (!pCell) continue;
          const cx = hasRotTween
            ? (px - pieceCols * 0.5) * cellSize
            : x + (smoothPieceX + px) * cellSize;
          const cy = hasRotTween
            ? (py - pieceRows * 0.5) * cellSize
            : y + (smoothPieceY + py) * cellSize;
          if (pCell.isBlocked) {
            this.drawBlockedObsidianTile(ctx, cx, cy, cellSize, lockProgress * 0.25);
            continue;
          }
          this.writePieceCellJoins(activePiece, py, px, this.tmpJoins);
          this.tmpBlockFx.row = py;
          this.tmpBlockFx.col = Math.round(smoothPieceX + px);
          this.tmpBlockFx.inSquare = false;
          this.tmpBlockFx.chainMarked = false;
          this.tmpBlockFx.pendingClear = false;
          this.tmpBlockFx.sweptCol = false;
          this.tmpBlockFx.landFlash = lockProgress * 0.22;
          this.tmpBlockFx.rippleGlow = 0;
          this.tmpBlockFx.beatPhase = beatPhase;
          this.tmpBlockFx.timeSec = timeSec;
          this.tmpBlockFx.shimmerWave = 0;
          this.tmpBlockFx.isWild = Boolean(pCell.isWild);
          this.tmpBlockFx.isCrashGem = Boolean(pCell.isCrashGem);
          this.tmpBlockFx.frostHp = 0;
          this.tmpBlockFx.isVirus = false;
          this.tmpBlockFx.patternMode = this.patternMode;
          this.drawBlockCell(
            ctx,
            cx,
            cy,
            cellSize,
            pCell.color,
            pCell.isChain,
            skin,
            this.tmpJoins,
            this.tmpBlockFx
          );
        }
      }
      ctx.restore();

      if (lockProgress > 0.04) {
        ctx.save();
        ctx.fillStyle = palette.hudAccent;
        ctx.globalAlpha = 0.82;
        if (activePieceGravDir === 'down') {
          const barW = cellSize * pieceCols * (1 - lockProgress);
          const barX = x + smoothPieceX * cellSize + (cellSize * pieceCols - barW) * 0.5;
          const barY = y + (smoothPieceY + pieceRows) * cellSize + 2;
          ctx.fillRect(barX, barY, barW, 2.5);
        } else if (activePieceGravDir === 'up') {
          const barW = cellSize * pieceCols * (1 - lockProgress);
          const barX = x + smoothPieceX * cellSize + (cellSize * pieceCols - barW) * 0.5;
          const barY = y + smoothPieceY * cellSize - 4.5;
          ctx.fillRect(barX, barY, barW, 2.5);
        } else if (activePieceGravDir === 'right') {
          const barH = cellSize * pieceRows * (1 - lockProgress);
          const barY = y + smoothPieceY * cellSize + (cellSize * pieceRows - barH) * 0.5;
          const barX = x + (smoothPieceX + pieceCols) * cellSize + 2;
          ctx.fillRect(barX, barY, 2.5, barH);
        } else {
          const barH = cellSize * pieceRows * (1 - lockProgress);
          const barY = y + smoothPieceY * cellSize + (cellSize * pieceRows - barH) * 0.5;
          const barX = x + smoothPieceX * cellSize - 4.5;
          ctx.fillRect(barX, barY, 2.5, barH);
        }
        ctx.restore();
      }
    }

    if (board.activeShift === 'lantern_sweep' && typeof document !== 'undefined') {
      const mw = Math.max(1, Math.ceil(width));
      const mh = Math.max(1, Math.ceil(height));
      if (!this.lanternMaskCanvas) {
        this.lanternMaskCanvas = this.createOffscreen(mw, mh);
      } else if (this.lanternMaskCanvas.width !== mw || this.lanternMaskCanvas.height !== mh) {
        this.lanternMaskCanvas.width = mw;
        this.lanternMaskCanvas.height = mh;
      }
      const mctx = this.lanternMaskCanvas.getContext('2d');
      if (mctx) {
        mctx.globalCompositeOperation = 'source-over';
        mctx.clearRect(0, 0, mw, mh);
        mctx.fillStyle = 'rgba(14, 12, 22, 0.72)';
        mctx.fillRect(0, 0, mw, mh);
        mctx.globalCompositeOperation = 'destination-out';

        const punchHole = (hx: number, hy: number, rOuter: number) => {
          const g = mctx.createRadialGradient(hx, hy, rOuter * 0.22, hx, hy, rOuter);
          g.addColorStop(0, 'rgba(0, 0, 0, 1)');
          g.addColorStop(0.62, 'rgba(0, 0, 0, 0.78)');
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          mctx.fillStyle = g;
          mctx.beginPath();
          mctx.arc(hx, hy, rOuter, 0, Math.PI * 2);
          mctx.fill();
        };

        const beamLocalX = tlX - x;
        for (let rowSlice = 0; rowSlice <= 3; rowSlice++) {
          punchHole(beamLocalX, (rowSlice / 3) * mh, cellSize * 2.45);
        }
        if (activePiece) {
          const pCols = activePiece.cells[0]?.length ?? 2;
          const pRows = activePiece.cells.length;
          punchHole(
            (smoothPieceX + pCols * 0.5) * cellSize,
            (smoothPieceY + pRows * 0.5) * cellSize,
            cellSize * 2.85
          );
        }
        mctx.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.drawImage(this.lanternMaskCanvas, x, y, width, height);
        ctx.restore();
      }
    }

    if (board.activeShift === 'ceiling_press') {
      const lockRows = board.ceilingLockRows ?? 0;
      const badgeY = label ? y - 34 : y - 42;
      ctx.save();
      ctx.fillStyle = 'rgba(24, 20, 34, 0.84)';
      this.roundRect(ctx, x + 2, badgeY, 76, 17, 4);
      ctx.fill();
      ctx.strokeStyle = lockRows >= 2 ? '#e05b5b' : palette.hudAccent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#faf6ee';
      ctx.font = '700 9.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`SHUTTER ${lockRows}/3`, x + 40, badgeY + 8.5);
      ctx.restore();
    } else if (board.activeShift === 'metronome_charge') {
      const accum = board.beatChargeAccum ?? 0;
      const badgeY = label ? y - 34 : y - 42;
      ctx.save();
      ctx.fillStyle = 'rgba(24, 20, 34, 0.82)';
      this.roundRect(ctx, x + width - 54, badgeY, 52, 16, 4);
      ctx.fill();
      for (let pip = 0; pip < 3; pip++) {
        ctx.fillStyle = pip < accum ? '#3db87a' : 'rgba(250, 246, 238, 0.28)';
        this.drawDiamond(ctx, x + width - 42 + pip * 14, badgeY + 8, 4.2);
      }
      ctx.restore();
    } else if (isSunMoon) {
      const sunMoonStyle = getBlockStyle(palette, sunMoonActiveColor);
      const badgeY = label ? y - 38 : y - 48;
      ctx.save();
      ctx.fillStyle = 'rgba(24, 20, 34, 0.84)';
      this.roundRect(ctx, x + 2, badgeY, 68, 16, 4);
      ctx.fill();
      ctx.strokeStyle = sunMoonStyle.fill;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = sunMoonStyle.fill;
      this.fillCircle(ctx, x + 13, badgeY + 8, 4);
      ctx.fillStyle = '#faf6ee';
      ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sunMoonActiveColor === 0 ? 'SUN' : 'MOON', x + 22, badgeY + 8.5);
      ctx.restore();
    } else if (isChromaticWells && board.wellRegions && board.wellRegions.length >= 2) {
      const leftColor = getBlockStyle(palette, chromaticFlip as CellColor);
      const rightColor = getBlockStyle(palette, (1 - chromaticFlip) as CellColor);
      const badgeY = label ? y - 38 : y - 48;
      const drawWellChip = (reg: { minCol: number; maxCol: number }, swatch: string, txt: string) => {
        const cx = x + ((reg.minCol + reg.maxCol + 1) * 0.5) * cellSize;
        ctx.save();
        ctx.fillStyle = 'rgba(24, 20, 34, 0.84)';
        this.roundRect(ctx, cx - 22, badgeY, 44, 15, 4);
        ctx.fill();
        ctx.strokeStyle = swatch;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = swatch;
        this.fillCircle(ctx, cx - 11, badgeY + 7.5, 3.6);
        ctx.fillStyle = '#faf6ee';
        ctx.font = '700 8.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, cx - 3, badgeY + 8);
        ctx.restore();
      };
      drawWellChip(board.wellRegions[0], leftColor.fill, 'CLR');
      drawWellChip(board.wellRegions[1], rightColor.fill, 'CLR');
    } else if (isLighthouse) {
      const badgeY = label ? y - 38 : y - 48;
      ctx.save();
      ctx.fillStyle = 'rgba(24, 20, 34, 0.84)';
      this.roundRect(ctx, x + 2, badgeY, 82, 16, 4);
      ctx.fill();
      ctx.strokeStyle = lighthouseStyle.fill;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = lighthouseStyle.fill;
      this.fillCircle(ctx, x + 13, badgeY + 8, 4);
      ctx.fillStyle = '#faf6ee';
      ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('BEAM CLR', x + 22, badgeY + 8.5);
      ctx.restore();
    }

    const drawSweepCounterBadge = (beamX: number, badgeBg?: string) => {
      if (board.sweepState.squaresThisSweep <= 0) return;
      const badgeText = `${board.sweepState.squaresThisSweep}`;
      const bx = Math.min(Math.max(beamX, x + 16), x + width - 16);
      const by = y - 24;
      ctx.save();
      ctx.fillStyle = palette.squareHighlight;
      ctx.globalAlpha = 0.28 + beatPulse * 0.22;
      ctx.beginPath();
      ctx.arc(bx, by, 16 + beatPulse * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = badgeBg ?? palette.timelineBeam;
      this.roundRect(ctx, bx - 13, by - 10, 26, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#faf6ee';
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx, by + 0.5);
    };

    const drawSweepSegment = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      beamHex?: string,
      coreHex?: string
    ) => {
      ctx.strokeStyle = beamHex ?? palette.timelineBeam;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = coreHex ?? palette.squareHighlight;
      ctx.globalAlpha = 0.45 + beatPulse * 0.25;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawSweepBeam = (
      beamX: number,
      showCounterBadge: boolean,
      beamHex?: string,
      coreHex?: string
    ) => {
      ctx.save();
      const beamCol = Math.min(
        boardCols - 1,
        Math.max(0, Math.floor(((beamX - x) / Math.max(1, width)) * boardCols))
      );
      let hasBeamHit = false;
      for (let r = 0; r < boardRows; r++) {
        const c = board.grid[r][beamCol];
        if (c && (c.inSquare || c.chainMarked || c.pendingClear)) {
          hasBeamHit = true;
          break;
        }
      }
      const aheadMarked = countMarkedAheadOfBeam(
        board.grid,
        beamCol,
        isRtlSweep,
        4
      );
      if (hasBeamHit || aheadMarked > 0) {
        ctx.strokeStyle = coreHex ?? palette.squareHighlight;
        ctx.lineWidth = 5 + Math.min(10, aheadMarked * 0.9);
        ctx.globalAlpha = Math.min(
          0.68,
          0.16 + aheadMarked * 0.045 + (hasBeamHit ? 0.2 : 0) + beatPulse * 0.16
        );
        ctx.beginPath();
        ctx.moveTo(beamX, y);
        ctx.lineTo(beamX, y + height);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawSweepSegment(beamX, y - 8, beamX, y + height + 8, beamHex, coreHex);
      ctx.fillStyle = beamHex ?? palette.timelineBeam;
      this.drawDiamond(ctx, beamX, y - 9, 6 + beatPulse * 1.1);
      this.drawDiamond(ctx, beamX, y + height + 9, 6 + beatPulse * 1.1);
      if (showCounterBadge) drawSweepCounterBadge(beamX, beamHex);
      ctx.restore();
    };

    if (isLighthouse) {
      const originX = x + width * 0.5;
      const originY = y + height;
      const reach = Math.hypot(width, height) * 1.05;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 4, y - 4, width + 8, height + 8);
      ctx.clip();
      const rayEndX = originX + Math.cos(lighthouseAngle) * reach;
      const rayEndY = originY - Math.sin(lighthouseAngle) * reach;
      drawSweepSegment(
        originX,
        originY,
        rayEndX,
        rayEndY,
        lighthouseStyle.fill,
        lighthouseStyle.highlight
      );
      ctx.restore();

      // Floor lighthouse turret base
      ctx.save();
      ctx.fillStyle = '#241f31';
      ctx.strokeStyle = lighthouseStyle.fill;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(originX, originY + 2, 11 + beatPulse * 1.2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = lighthouseStyle.highlight;
      this.fillCircle(ctx, originX, originY - 2, 3.8 + beatPulse * 0.6);
      drawSweepCounterBadge(
        Math.min(x + width - 18, Math.max(x + 18, originX + Math.cos(lighthouseAngle) * (height * 0.5))),
        lighthouseStyle.fill
      );
      ctx.restore();
    } else if (isSplitHalfSweep) {
      ctx.save();
      drawSweepSegment(tlX, y - 8, tlX, splitY);
      ctx.fillStyle = palette.timelineBeam;
      this.drawDiamond(ctx, tlX, y - 9, 6 + beatPulse * 1.1);
      this.drawDiamond(ctx, tlX, splitY, 4.6 + beatPulse * 0.8);

      drawSweepSegment(tl2X, splitY, tl2X, y + height + 8);
      this.drawDiamond(ctx, tl2X, splitY, 4.6 + beatPulse * 0.8);
      this.drawDiamond(ctx, tl2X, y + height + 9, 6 + beatPulse * 1.1);

      drawSweepCounterBadge(tlX);
      ctx.restore();
    } else if (isDiagonalSlantSweep) {
      ctx.save();
      const uTop = timelineNorm;
      const uBot = timelineNorm - slantNorm;
      const topX = x + uTop * width;
      const botX = x + slantBotNorm * width;
      if (uBot >= 0) {
        drawSweepSegment(topX, y - 6, botX, y + height + 6);
      } else {
        const wrapT = Math.min(1, Math.max(0, uTop / Math.max(0.001, slantNorm)));
        const wrapY = y + wrapT * height;
        drawSweepSegment(topX, y - 6, x, wrapY);
        drawSweepSegment(x + width, wrapY, botX, y + height + 6);
      }
      ctx.fillStyle = palette.timelineBeam;
      this.drawDiamond(ctx, topX, y - 9, 6 + beatPulse * 1.1);
      this.drawDiamond(ctx, botX, y + height + 9, 6 + beatPulse * 1.1);
      drawSweepCounterBadge(topX);
      ctx.restore();
    } else if (isDuelingBeams) {
      drawSweepBeam(tlX, true, palette.blockA.fill, palette.blockA.highlight);
      drawSweepBeam(duelingRtlX, false, palette.blockB.fill, palette.blockB.highlight);
    } else if (isTrichromaSweep) {
      drawSweepBeam(tlX, true, palette.blockA.fill, palette.blockA.highlight);
      drawSweepBeam(tlTri1X, false, palette.blockB.fill, palette.blockB.highlight);
      drawSweepBeam(tlTri2X, false, palette.blockC.fill, palette.blockC.highlight);
    } else if (isSunMoon) {
      const st = getBlockStyle(palette, sunMoonActiveColor);
      drawSweepBeam(tlX, true, st.fill, st.highlight);
    } else if (isChromaticWells && chromaticActiveColor !== null) {
      const st = getBlockStyle(palette, chromaticActiveColor);
      drawSweepBeam(tlX, true, st.fill, st.highlight);
    } else {
      drawSweepBeam(tlX, true);
      if (isTwinSweep) {
        drawSweepBeam(tl2X, false);
      }
    }

    this.drawBoardFrameAccents(ctx, x, y, width, height, skin, timeSec, beatPhase);

    ctx.restore();
  }

  private drawBoardFrame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    skin: SkinConfig,
    hasPendingGarbage: boolean,
    timeSec: number,
    beatPhase: number
  ): void {
    const { palette, theme } = skin;
    const fx = x - 6;
    const fy = y - 6;
    const fw = width + 12;
    const fh = height + 12;
    const beatPulse = Math.pow(1 - beatPhase, 2.4);

    ctx.save();
    ctx.strokeStyle = hasPendingGarbage ? palette.hudAccent : palette.boardFrame;

    if (theme === 'miami_vice') {
      ctx.lineWidth = hasPendingGarbage ? 3.2 : 2.6;
      ctx.shadowColor = palette.blockA.fill;
      ctx.shadowBlur = 10 + beatPulse * 6;
      this.roundRect(ctx, fx - 2, fy - 2, fw + 4, fh + 4, 12);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = palette.blockB.fill;
      ctx.lineWidth = 1.4;
      this.roundRect(ctx, fx + 2, fy + 2, fw - 4, fh - 4, 8);
      ctx.stroke();
    } else if (theme === 'detroit_visor') {
      const ch = 12;
      ctx.lineWidth = hasPendingGarbage ? 3 : 2.4;
      ctx.beginPath();
      ctx.moveTo(fx + ch, fy);
      ctx.lineTo(fx + fw - ch, fy);
      ctx.lineTo(fx + fw, fy + ch);
      ctx.lineTo(fx + fw, fy + fh - ch);
      ctx.lineTo(fx + fw - ch, fy + fh);
      ctx.lineTo(fx + ch, fy + fh);
      ctx.lineTo(fx, fy + fh - ch);
      ctx.lineTo(fx, fy + ch);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.45 + beatPulse * 0.25;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(fx + 3, fy + 3, fw - 6, fh - 6);
    } else if (theme === 'sumi_bamboo') {
      ctx.lineWidth = hasPendingGarbage ? 3.2 : 2.6;
      this.roundRect(ctx, fx, fy, fw, fh, 6);
      ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.4;
      this.roundRect(ctx, fx - 2.5, fy + 1.5, fw + 5, fh - 3, 7);
      ctx.stroke();
    } else if (theme === 'stained_glass') {
      ctx.lineWidth = 4.2;
      this.roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.stroke();
      ctx.strokeStyle = palette.blockC.fill;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.2;
      this.roundRect(ctx, fx + 2.5, fy + 2.5, fw - 5, fh - 5, 7);
      ctx.stroke();
    } else if (theme === 'neo_andean') {
      ctx.lineWidth = hasPendingGarbage ? 3.2 : 2.6;
      this.roundRect(ctx, fx, fy, fw, fh, 6);
      ctx.stroke();
      ctx.strokeStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.6;
      this.roundRect(ctx, fx + 2.6, fy + 2.6, fw - 5.2, fh - 5.2, 4);
      ctx.stroke();
    } else if (theme === 'constructivist' || theme === 'cubist_atelier') {
      ctx.lineWidth = hasPendingGarbage ? 3.2 : 2.5;
      ctx.strokeRect(fx, fy, fw, fh);
      ctx.strokeStyle = palette.hudAccent;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 3, fy + 3, fw - 6, fh - 6);
    } else {
      ctx.lineWidth = hasPendingGarbage ? 2.6 : 2.1;
      this.roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.stroke();
      if (
        theme === 'gorogoa' ||
        theme === 'gris' ||
        theme === 'botanical_herbarium' ||
        theme === 'noland_target' ||
        theme === 'artisan_blocks' ||
        theme === 'transistor' ||
        theme === 'cityscape_deco' ||
        theme === 'celadon_fresco' ||
        theme === 'neko_sketchbook'
      ) {
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1;
        this.roundRect(ctx, fx + 3, fy + 3, fw - 6, fh - 6, 7);
        ctx.stroke();
      }
    }
    void timeSec;
    ctx.restore();
  }

  private drawBoardFrameAccents(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    skin: SkinConfig,
    timeSec: number,
    beatPhase: number
  ): void {
    const { palette, theme } = skin;
    const fx = x - 6;
    const fy = y - 6;
    const fw = width + 12;
    const fh = height + 12;
    const beatPulse = Math.pow(1 - beatPhase, 2.4);

    ctx.save();
    if (theme === 'neko_sketchbook') {
      const drawEar = (cx: number, cy: number, side: -1 | 1) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = palette.blockA.fill;
        ctx.strokeStyle = palette.boardFrame;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(side * 4, -18);
        ctx.lineTo(side * -18, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f5a9a9';
        ctx.beginPath();
        ctx.moveTo(side * -2, 0);
        ctx.lineTo(side * 2, -11);
        ctx.lineTo(side * -11, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      drawEar(fx + 28, fy + 1, -1);
      drawEar(fx + fw - 28, fy + 1, 1);

      ctx.strokeStyle = palette.boardFrame;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let dy = -4; dy <= 4; dy += 4) {
        ctx.moveTo(fx - 9, fy + fh * 0.5 + dy);
        ctx.lineTo(fx - 1, fy + fh * 0.5 + dy * 0.6);
        ctx.moveTo(fx + fw + 9, fy + fh * 0.5 + dy);
        ctx.lineTo(fx + fw + 1, fy + fh * 0.5 + dy * 0.6);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const wag = Math.sin(timeSec * 3.4) * 0.25;
      ctx.save();
      ctx.translate(fx + fw - 1, fy + fh - 10);
      ctx.rotate(wag);
      ctx.strokeStyle = palette.boardFrame;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(18, -2, 22, -22, 9, -24);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = palette.hudAccent;
      ctx.globalAlpha = 0.85;
      const px = fx - 5;
      const py = fy + fh - 6;
      this.fillCircle(ctx, px, py, 3.6);
      this.fillCircle(ctx, px - 4, py - 5, 1.5);
      this.fillCircle(ctx, px, py - 6.5, 1.5);
      this.fillCircle(ctx, px + 4, py - 5, 1.5);
    } else if (theme === 'sumi_bamboo') {
      ctx.fillStyle = palette.hudAccent;
      this.roundRect(ctx, fx + fw - 14, fy + fh - 14, 18, 18, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#faf5ec';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(fx + fw - 11, fy + fh - 11, 12, 12);
      ctx.beginPath();
      ctx.moveTo(fx + fw - 5, fy + fh - 10);
      ctx.lineTo(fx + fw - 5, fy + fh);
      ctx.moveTo(fx + fw - 10, fy + fh - 5);
      ctx.lineTo(fx + fw, fy + fh - 5);
      ctx.stroke();
    } else if (theme === 'detroit_visor') {
      ctx.strokeStyle = palette.timelineBeam;
      ctx.lineWidth = 2.4;
      const arm = 16;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const cx = i % 2 === 0 ? fx - 4 : fx + fw + 4;
        const cy = i < 2 ? fy - 4 : fy + fh + 4;
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        ctx.moveTo(cx, cy + dy * arm);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * arm, cy);
      }
      ctx.stroke();
    } else if (theme === 'neo_andean') {
      for (let idx = 0; idx < 4; idx++) {
        const cx = idx % 2 === 0 ? fx + 1 : fx + fw - 1;
        const cy = idx < 2 ? fy + 1 : fy + fh - 1;
        ctx.fillStyle =
          idx === 0 || idx === 3 ? palette.blockA.fill : idx === 1 ? palette.blockB.fill : palette.blockC.fill;
        ctx.fillRect(cx - 4, cy - 9, 8, 18);
        ctx.fillRect(cx - 9, cy - 4, 18, 8);
        ctx.fillRect(cx - 6, cy - 6, 12, 12);
        ctx.fillStyle = palette.architectureLight;
        ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
      }
    } else if (theme === 'stained_glass') {
      const r = 6 + beatPulse * 1.2;
      ctx.strokeStyle = palette.boardFrame;
      ctx.lineWidth = 1.4;
      for (let idx = 0; idx < 4; idx++) {
        const cx = idx % 2 === 0 ? fx + 1 : fx + fw - 1;
        const cy = idx < 2 ? fy + 1 : fy + fh - 1;
        ctx.fillStyle =
          idx === 0 || idx === 3 ? palette.blockA.fill : idx === 1 ? palette.blockB.fill : palette.blockC.fill;
        this.drawDiamond(ctx, cx, cy, r);
        ctx.stroke();
      }
    } else if (theme === 'constructivist') {
      ctx.fillStyle = palette.blockA.fill;
      ctx.fillRect(fx - 4, fy - 4, 24, 5);
      ctx.fillRect(fx - 4, fy - 4, 5, 24);
      ctx.fillRect(fx + fw - 20, fy + fh - 1, 24, 5);
      ctx.fillRect(fx + fw - 1, fy + fh - 20, 5, 24);
    } else if (theme === 'botanical_herbarium') {
      ctx.fillStyle = palette.blockC.fill;
      ctx.globalAlpha = 0.85;
      const tri = 14;
      ctx.beginPath();
      ctx.moveTo(fx - 2, fy - 2);
      ctx.lineTo(fx + tri, fy - 2);
      ctx.lineTo(fx - 2, fy + tri);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx + fw + 2, fy + fh + 2);
      ctx.lineTo(fx + fw - tri, fy + fh + 2);
      ctx.lineTo(fx + fw + 2, fy + fh - tri);
      ctx.closePath();
      ctx.fill();
    } else if (theme === 'memphis_milano') {
      ctx.fillStyle = palette.blockC.fill;
      this.fillCircle(ctx, fx, fy, 6);
      this.fillCircle(ctx, fx + fw, fy + fh, 6);
      ctx.fillStyle = palette.blockA.fill;
      this.fillCircle(ctx, fx + fw, fy, 5.5);
      this.fillCircle(ctx, fx, fy + fh, 5.5);
    } else if (theme === 'cubist_atelier') {
      ctx.fillStyle = palette.blockB.fill;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(fx - 3, fy + 6, 6, 16);
      ctx.fillStyle = palette.blockA.fill;
      ctx.fillRect(fx + fw - 3, fy + fh - 22, 6, 16);
    } else if (theme === 'scandi_showroom') {
      ctx.fillStyle = palette.blockB.fill;
      ctx.fillRect(fx + fw - 26, fy - 5, 22, 9);
      ctx.fillStyle = palette.blockA.fill;
      this.fillCircle(ctx, fx + 1, fy + 1, 4);
      this.fillCircle(ctx, fx + 1, fy + fh - 1, 4);
      this.fillCircle(ctx, fx + fw - 1, fy + fh - 1, 4);
    } else if (theme === 'grand_budapest' || theme === 'space_terminal') {
      ctx.fillStyle = theme === 'space_terminal' ? palette.blockA.fill : palette.blockB.fill;
      this.fillCircle(ctx, fx + 1, fy + 1, 4.2);
      this.fillCircle(ctx, fx + fw - 1, fy + 1, 4.2);
      this.fillCircle(ctx, fx + 1, fy + fh - 1, 4.2);
      this.fillCircle(ctx, fx + fw - 1, fy + fh - 1, 4.2);
    } else if (theme === 'de_stijl' || theme === 'kodak_cinema') {
      ctx.fillStyle = palette.blockA.fill;
      ctx.fillRect(fx - 3, fy - 3, 18, 4);
      ctx.fillRect(fx - 3, fy - 3, 4, 18);
      ctx.fillStyle = palette.blockB.fill;
      ctx.fillRect(fx + fw - 15, fy + fh - 1, 18, 4);
      ctx.fillRect(fx + fw - 1, fy + fh - 15, 4, 18);
    } else if (theme === 'vinyl_lounge') {
      ctx.fillStyle = palette.blockA.fill;
      ctx.globalAlpha = 0.65 + beatPulse * 0.35;
      this.fillCircle(ctx, fx + 18, fy - 2, 4.5);
      this.fillCircle(ctx, fx + fw - 18, fy - 2, 4.5);
    } else if (
      theme === 'monument_valley' ||
      theme === 'sennaar' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'transistor' ||
      theme === 'cityscape_deco' ||
      theme === 'fez' ||
      theme === 'machinarium' ||
      theme === 'ukiyoe_wave' ||
      theme === 'kinetic_bauhaus' ||
      theme === 'synth_greenhouse'
    ) {
      ctx.fillStyle = theme === 'machinarium' ? palette.blockA.highlight : palette.boardFrame;
      ctx.globalAlpha = 0.72;
      const r = theme === 'fez' ? 3.5 : 3;
      if (theme === 'fez') {
        ctx.fillRect(fx + 1 - r, fy + 1 - r, r * 2, r * 2);
        ctx.fillRect(fx + fw - 1 - r, fy + 1 - r, r * 2, r * 2);
        ctx.fillRect(fx + 1 - r, fy + fh - 1 - r, r * 2, r * 2);
        ctx.fillRect(fx + fw - 1 - r, fy + fh - 1 - r, r * 2, r * 2);
      } else {
        this.fillCircle(ctx, fx + 1, fy + 1, r);
        this.fillCircle(ctx, fx + fw - 1, fy + 1, r);
        this.fillCircle(ctx, fx + 1, fy + fh - 1, r);
        this.fillCircle(ctx, fx + fw - 1, fy + fh - 1, r);
      }
    }
    ctx.restore();
  }

  private drawGhostPiece(
    ctx: CanvasRenderingContext2D,
    boardX: number,
    boardY: number,
    cellSize: number,
    board: BoardState,
    piece: Piece,
    skin: SkinConfig,
    visualPieceX: number,
    visualPieceY: number,
    beatPhase: number
  ): void {
    const landing = getPieceLandingColumns(board, piece);
    const pieceRows = piece.cells.length;
    const pieceCols = piece.cells[0]?.length ?? 2;
    const colBottomRows = landing.colBottomRows;
    const dir = landing.gravityDirection ?? 'down';
    const beatPulse = Math.pow(1 - beatPhase, 2.5);
    const boardRows = board.grid.length;
    const boardCols = board.grid[0]?.length ?? board.cols ?? BOARD_COLS;

    ctx.save();

    if (dir === 'down') {
      const colLowestPy: number[] = [];
      for (let px = 0; px < pieceCols; px++) {
        let lowPy = -1;
        for (let py = pieceRows - 1; py >= 0; py--) {
          if (piece.cells[py]?.[px] !== null) {
            lowPy = py;
            break;
          }
        }
        colLowestPy.push(lowPy);
        const bottomRow = colBottomRows[px] ?? -1;
        if (lowPy < 0 || bottomRow < 0) continue;
        const topFillRow = Math.max(0, visualPieceY + lowPy + 1);
        const colX = boardX + (piece.x + px) * cellSize;
        if (bottomRow + 1 > topFillRow) {
          const beamTop = boardY + topFillRow * cellSize;
          const beamBot = boardY + (bottomRow + 1) * cellSize;
          const grad = ctx.createLinearGradient(0, beamTop, 0, beamBot);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0.04)');
          grad.addColorStop(1, skin.palette.timelineGlow);
          ctx.globalAlpha = 0.28 + beatPulse * 0.06;
          ctx.fillStyle = grad;
          ctx.fillRect(colX, beamTop, cellSize, beamBot - beamTop);
        }
      }

      ctx.globalAlpha = 0.32 + beatPulse * 0.08;
      ctx.strokeStyle = skin.palette.timelineBeam;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      const leftLowPy = colLowestPy[0] ?? pieceRows - 1;
      const leftBeamTop = boardY + Math.max(0, visualPieceY + Math.max(0, leftLowPy) + 1) * cellSize;
      const leftBeamBot = boardY + Math.max(0, (colBottomRows[0] ?? -1) + 1) * cellSize;
      if (leftBeamBot > leftBeamTop) {
        ctx.beginPath();
        ctx.moveTo(boardX + piece.x * cellSize + 0.5, leftBeamTop);
        ctx.lineTo(boardX + piece.x * cellSize + 0.5, leftBeamBot);
        ctx.stroke();
      }
      const lastPx = Math.max(0, pieceCols - 1);
      const rightLowPy = colLowestPy[lastPx] ?? pieceRows - 1;
      const rightBeamTop = boardY + Math.max(0, visualPieceY + Math.max(0, rightLowPy) + 1) * cellSize;
      const rightBeamBot = boardY + Math.max(0, (colBottomRows[lastPx] ?? -1) + 1) * cellSize;
      if (rightBeamBot > rightBeamTop) {
        ctx.beginPath();
        ctx.moveTo(boardX + (piece.x + pieceCols) * cellSize - 0.5, rightBeamTop);
        ctx.lineTo(boardX + (piece.x + pieceCols) * cellSize - 0.5, rightBeamBot);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (dir === 'up') {
      for (let px = 0; px < pieceCols; px++) {
        const topStopRow = colBottomRows[px] ?? -1;
        if (topStopRow < 0) continue;
        let highPy = pieceRows;
        for (let py = 0; py < pieceRows; py++) {
          if (piece.cells[py]?.[px] !== null) {
            highPy = py;
            break;
          }
        }
        if (highPy >= pieceRows) continue;
        const botEdge = boardY + Math.min(boardRows, visualPieceY + highPy) * cellSize;
        const topEdge = boardY + topStopRow * cellSize;
        if (botEdge > topEdge) {
          const colX = boardX + (piece.x + px) * cellSize;
          const grad = ctx.createLinearGradient(0, botEdge, 0, topEdge);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0.04)');
          grad.addColorStop(1, skin.palette.timelineGlow);
          ctx.globalAlpha = 0.26 + beatPulse * 0.06;
          ctx.fillStyle = grad;
          ctx.fillRect(colX, topEdge, cellSize, botEdge - topEdge);
        }
      }
    } else if (dir === 'right') {
      for (let py = 0; py < pieceRows; py++) {
        const rightStopCol = colBottomRows[py] ?? -1;
        if (rightStopCol < 0) continue;
        let rightPx = -1;
        for (let px = pieceCols - 1; px >= 0; px--) {
          if (piece.cells[py]?.[px] !== null) {
            rightPx = px;
            break;
          }
        }
        if (rightPx < 0) continue;
        const leftEdge = boardX + Math.max(0, visualPieceX + rightPx + 1) * cellSize;
        const rightEdge = boardX + (rightStopCol + 1) * cellSize;
        if (rightEdge > leftEdge) {
          const rowY = boardY + (piece.y + py) * cellSize;
          const grad = ctx.createLinearGradient(leftEdge, 0, rightEdge, 0);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0.04)');
          grad.addColorStop(1, skin.palette.timelineGlow);
          ctx.globalAlpha = 0.26 + beatPulse * 0.06;
          ctx.fillStyle = grad;
          ctx.fillRect(leftEdge, rowY, rightEdge - leftEdge, cellSize);
        }
      }
    } else if (dir === 'left') {
      for (let py = 0; py < pieceRows; py++) {
        const leftStopCol = colBottomRows[py] ?? -1;
        if (leftStopCol < 0) continue;
        let leftPx = pieceCols;
        for (let px = 0; px < pieceCols; px++) {
          if (piece.cells[py]?.[px] !== null) {
            leftPx = px;
            break;
          }
        }
        if (leftPx >= pieceCols) continue;
        const rightEdge = boardX + Math.min(boardCols, visualPieceX + leftPx) * cellSize;
        const leftEdge = boardX + leftStopCol * cellSize;
        if (rightEdge > leftEdge) {
          const rowY = boardY + (piece.y + py) * cellSize;
          const grad = ctx.createLinearGradient(rightEdge, 0, leftEdge, 0);
          grad.addColorStop(0, 'rgba(250, 246, 238, 0.04)');
          grad.addColorStop(1, skin.palette.timelineGlow);
          ctx.globalAlpha = 0.26 + beatPulse * 0.06;
          ctx.fillStyle = grad;
          ctx.fillRect(leftEdge, rowY, rightEdge - leftEdge, cellSize);
        }
      }
    }

    const hasGhostAt = (gx: number, gy: number, color: CellColor): boolean => {
      for (let i = 0; i < landing.ghostCells.length; i++) {
        const o = landing.ghostCells[i];
        if (!o.isBlocked && !o.isWild && o.x === gx && o.y === gy && o.color === color) {
          return true;
        }
      }
      return false;
    };

    for (const gc of landing.ghostCells) {
      if (gc.x < 0 || gc.x >= boardCols || gc.y < 0 || gc.y >= boardRows) continue;
      if (
        Math.abs(gc.x - visualPieceX) < pieceCols &&
        Math.abs(gc.y - visualPieceY) < pieceRows &&
        gc.x >= piece.x &&
        gc.x < piece.x + pieceCols &&
        gc.y >= piece.y &&
        gc.y < piece.y + pieceRows &&
        piece.cells[gc.y - piece.y]?.[gc.x - piece.x] !== null
      ) {
        continue;
      }

      const cx = boardX + gc.x * cellSize;
      const cy = boardY + gc.y * cellSize;

      if (gc.isBlocked) {
        ctx.fillStyle = '#221d2d';
        ctx.globalAlpha = 0.34 + beatPulse * 0.08;
        ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = '#6c6282';
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(cx + 2, cy + 2, Math.max(2, cellSize - 4), Math.max(2, cellSize - 4));
        const m = Math.max(4, cellSize * 0.32);
        ctx.beginPath();
        ctx.moveTo(cx + m, cy + m);
        ctx.lineTo(cx + cellSize - m, cy + cellSize - m);
        ctx.moveTo(cx + cellSize - m, cy + m);
        ctx.lineTo(cx + m, cy + cellSize - m);
        ctx.stroke();
        continue;
      }

      const style = getBlockStyle(skin.palette, gc.color);
      const boardOpaqueHex = compositeColorOnHex(
        skin.palette.boardSurface,
        skin.palette.skyMid
      );
      const darkBoard = getWcagLuminance(boardOpaqueHex) < 0.25;
      const borderVsBoard = getWcagContrast(style.border, boardOpaqueHex);
      const ghostStroke = gc.isWild
        ? skin.palette.hudAccent
        : borderVsBoard >= 2.2
        ? style.border
        : darkBoard
        ? style.highlight
        : skin.palette.hudInk;

      const joinTop = !gc.isWild && hasGhostAt(gc.x, gc.y - 1, gc.color);
      const joinBot = !gc.isWild && hasGhostAt(gc.x, gc.y + 1, gc.color);
      const joinLeft = !gc.isWild && hasGhostAt(gc.x - 1, gc.y, gc.color);
      const joinRight = !gc.isWild && hasGhostAt(gc.x + 1, gc.y, gc.color);

      ctx.fillStyle = gc.isWild ? skin.palette.squareHighlight : style.fill;
      ctx.globalAlpha = (darkBoard ? 0.28 : 0.22) + beatPulse * 0.06;
      ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);

      ctx.globalAlpha = (darkBoard ? 0.8 : 0.68) + beatPulse * 0.14;
      ctx.strokeStyle = ghostStroke;
      ctx.lineWidth = darkBoard ? 2 : 1.75;
      if (!joinTop) {
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy + 2);
        ctx.lineTo(cx + cellSize - 2, cy + 2);
        ctx.stroke();
      }
      if (!joinBot) {
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy + cellSize - 2);
        ctx.lineTo(cx + cellSize - 2, cy + cellSize - 2);
        ctx.stroke();
      }
      if (!joinLeft) {
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy + 2);
        ctx.lineTo(cx + 2, cy + cellSize - 2);
        ctx.stroke();
      }
      if (!joinRight) {
        ctx.beginPath();
        ctx.moveTo(cx + cellSize - 2, cy + 2);
        ctx.lineTo(cx + cellSize - 2, cy + cellSize - 2);
        ctx.stroke();
      }
      if (gc.isWild) {
        ctx.fillStyle = '#faf6ee';
        ctx.globalAlpha = 0.62;
        this.drawDiamond(ctx, cx + cellSize * 0.5, cy + cellSize * 0.5, cellSize * 0.22);
      }
    }
    ctx.restore();
  }

  private drawObstacleCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    cell: Cell,
    board: BoardState,
    skin: SkinConfig,
    timeSec: number,
    beatPhase: number,
    row: number = -1,
    col: number = -1
  ): void {
    const styleType = cell.obstacleStyle ?? 'stone';
    const { palette } = skin;
    const beatGlow = Math.pow(1 - beatPhase, 3);
    const pad = 0.5;
    const bx = x + pad;
    const by = y + pad;
    const bw = Math.max(2, size - pad * 2);
    const bh = Math.max(2, size - pad * 2);
    const boardRows = board.grid.length;
    const boardCols = board.grid[0]?.length ?? board.cols ?? BOARD_COLS;

    const boardOpaqueHex = compositeColorOnHex(palette.boardSurface, palette.skyMid);
    const darkBoard = getWcagLuminance(boardOpaqueHex) < 0.25;

    ctx.save();
    if (styleType === 'blocked') {
      this.drawBlockedObsidianTile(ctx, x, y, size, cell.landFlash);
    } else if (styleType === 'chasm') {
      ctx.fillStyle = '#181422';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = darkBoard ? 'rgba(250, 246, 238, 0.28)' : 'rgba(250, 246, 238, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.5, by + 2);
      ctx.lineTo(bx + bw * 0.38, by + bh * 0.5);
      ctx.lineTo(bx + bw * 0.62, by + bh - 2);
      ctx.stroke();
      ctx.strokeStyle = darkBoard ? '#8f84ab' : palette.boardFrame;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    } else if (styleType === 'girder') {
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, '#5a556a');
      grad.addColorStop(0.5, '#3b3648');
      grad.addColorStop(1, '#292534');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#8b839d';
      ctx.fillRect(bx, by, bw, Math.max(2, size * 0.16));
      ctx.fillStyle = '#201c2c';
      ctx.fillRect(bx, by + bh - Math.max(2, size * 0.16), bw, Math.max(2, size * 0.16));
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.25)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + 2, by + bh * 0.25);
      ctx.lineTo(bx + bw - 2, by + bh * 0.75);
      ctx.moveTo(bx + bw - 2, by + bh * 0.25);
      ctx.lineTo(bx + 2, by + bh * 0.75);
      ctx.stroke();
      ctx.fillStyle = palette.hudAccent;
      const r = Math.max(1.2, size * 0.065);
      ctx.fillRect(bx + 3, by + 3, r, r);
      ctx.fillRect(bx + bw - 3 - r, by + 3, r, r);
    } else if (styleType === 'windmill') {
      const wm = board.windmillState;
      const isHub = wm !== null && wm !== undefined && col === wm.cx && row === wm.cy;
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      grad.addColorStop(0, isHub ? '#d4b475' : '#6f6782');
      grad.addColorStop(1, isHub ? '#755b32' : '#322c42');
      ctx.fillStyle = grad;
      this.roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, Math.max(2, size * 0.16));
      ctx.fill();
      if (isHub) {
        const cx = bx + bw * 0.5;
        const cy = by + bh * 0.5;
        ctx.fillStyle = '#261e30';
        this.fillCircle(ctx, cx, cy, size * 0.27);
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#faf6ee';
        this.fillCircle(ctx, cx, cy, size * 0.11 + beatGlow * 1.2);
      } else {
        ctx.strokeStyle = '#e5cf99';
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (wm?.orientation === 'vertical') {
          ctx.moveTo(bx + bw * 0.5, by + 2);
          ctx.lineTo(bx + bw * 0.5, by + bh - 2);
        } else {
          ctx.moveTo(bx + 2, by + bh * 0.5);
          ctx.lineTo(bx + bw - 2, by + bh * 0.5);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = darkBoard ? '#b8adcf' : '#211c2b';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.1;
      this.roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, Math.max(2, size * 0.16));
      ctx.stroke();
    } else if (styleType === 'piston') {
      const isLeft = col >= 0 ? col < boardCols * 0.5 : true;
      const ps = board.pistonState;
      const isHead =
        ps && col >= 0
          ? isLeft
            ? col === ps.leftDepth - 1
            : col === boardCols - ps.rightDepth
          : true;
      ctx.fillStyle = '#2d283b';
      ctx.fillRect(bx, by + bh * 0.22, bw, bh * 0.56);
      ctx.fillStyle = '#756e8a';
      ctx.fillRect(bx, by + bh * 0.34, bw, bh * 0.16);
      if (isHead) {
        const plateW = Math.max(4, bw * 0.36);
        const plateX = isLeft ? bx + bw - plateW : bx;
        const pGrad = ctx.createLinearGradient(plateX, by, plateX + plateW, by);
        pGrad.addColorStop(0, isLeft ? '#8f87a6' : '#d49a6a');
        pGrad.addColorStop(1, isLeft ? '#d49a6a' : '#8f87a6');
        ctx.fillStyle = pGrad;
        ctx.fillRect(plateX, by, plateW, bh);
        ctx.fillStyle = palette.hudAccent;
        ctx.fillRect(isLeft ? plateX + plateW - 2 : plateX, by + 1, 2, bh - 2);
      }
      ctx.strokeStyle = darkBoard ? '#9e93ba' : '#1f1a29';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    } else if (styleType === 'stalactite') {
      const belowSame =
        row >= 0 &&
        col >= 0 &&
        row + 1 < boardRows &&
        board.grid[row + 1]?.[col]?.obstacleStyle === 'stalactite';
      if (!belowSame) {
        const sGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        sGrad.addColorStop(0, '#6a617d');
        sGrad.addColorStop(1, '#312b3f');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw * 0.82, by + bh * 0.48);
        ctx.lineTo(bx + bw * 0.5, by + bh);
        ctx.lineTo(bx + bw * 0.18, by + bh * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 246, 238, 0.32)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx + 1, by + 1);
        ctx.lineTo(bx + bw * 0.5, by + bh - 1);
        ctx.stroke();
      } else {
        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, '#5a516c');
        grad.addColorStop(1, '#2f293b');
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(250, 246, 238, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.35, by);
        ctx.lineTo(bx + bw * 0.45, by + bh);
        ctx.stroke();
        ctx.strokeStyle = darkBoard ? '#9287ad' : '#1f1b29';
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      }
    } else if (styleType === 'bumper') {
      const shimmer = 0.12 + beatGlow * 0.24;
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      grad.addColorStop(0, '#6a657d');
      grad.addColorStop(1, '#2c273b');
      ctx.fillStyle = grad;
      this.roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, Math.max(2, size * 0.14));
      ctx.fill();
      ctx.strokeStyle = palette.hudAccent;
      ctx.globalAlpha = 0.68 + shimmer;
      ctx.lineWidth = 1.6;
      this.roundRect(ctx, bx + 1.5, by + 1.5, bw - 3, bh - 3, Math.max(1.5, size * 0.1));
      ctx.stroke();
      const dir = board.patrollingBumper?.dir ?? 1;
      const cx = bx + bw * 0.5;
      const cy = by + bh * 0.5;
      const tip = dir * size * 0.16;
      ctx.strokeStyle = '#faf6ee';
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(timeSec * 6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - tip, cy - size * 0.14);
      ctx.lineTo(cx + tip, cy);
      ctx.lineTo(cx - tip, cy + size * 0.14);
      ctx.stroke();
    } else if (styleType === 'spring') {
      const compress = Math.min(4, cell.landFlash * 4);
      ctx.fillStyle = '#2d2638';
      ctx.fillRect(bx, by + bh * 0.72, bw, bh * 0.28);
      ctx.strokeStyle = '#c5a572';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.26, by + bh * 0.72);
      ctx.lineTo(bx + bw * 0.72, by + bh * 0.56 + compress * 0.5);
      ctx.lineTo(bx + bw * 0.26, by + bh * 0.4 + compress);
      ctx.stroke();
      ctx.fillStyle = palette.hudAccent;
      this.roundRect(ctx, bx, by + compress, bw, Math.max(5, bh * 0.34), Math.max(2, size * 0.14));
      ctx.fill();
      ctx.fillStyle = '#faf6ee';
      ctx.globalAlpha = 0.85;
      const cx = bx + bw * 0.5;
      const cy = by + compress + bh * 0.17;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.14, cy + 2);
      ctx.lineTo(cx, cy - 3);
      ctx.lineTo(cx + size * 0.14, cy + 2);
      ctx.stroke();
    } else if (styleType === 'crumble') {
      const hp = cell.crumbleHp ?? 2;
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      grad.addColorStop(0, hp <= 1 ? '#e2a3b7' : '#d5c7df');
      grad.addColorStop(1, hp <= 1 ? '#8c536d' : '#6c5f82');
      ctx.fillStyle = grad;
      this.roundRect(ctx, bx, by, bw, bh, Math.max(2, size * 0.12));
      ctx.fill();
      ctx.strokeStyle = '#faf6ee';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55;
      this.roundRect(ctx, bx + 1.5, by + 1.5, bw - 3, bh - 3, Math.max(1, size * 0.08));
      ctx.stroke();
      if (hp <= 1) {
        ctx.strokeStyle = '#241b2c';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.2, by + 2);
        ctx.lineTo(bx + bw * 0.48, by + bh * 0.45);
        ctx.lineTo(bx + bw * 0.32, by + bh * 0.72);
        ctx.lineTo(bx + bw * 0.65, by + bh - 2);
        ctx.moveTo(bx + bw * 0.48, by + bh * 0.45);
        ctx.lineTo(bx + bw * 0.84, by + bh * 0.36);
        ctx.stroke();
      }
    } else {
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      grad.addColorStop(0, '#4d465c');
      grad.addColorStop(1, '#312b3d');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = 'rgba(250, 246, 238, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 1, by + bh - 1);
      ctx.lineTo(bx + 1, by + 1);
      ctx.lineTo(bx + bw - 1, by + 1);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(250, 246, 238, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.22, by + bh * 0.78);
      ctx.lineTo(bx + bw * 0.78, by + bh * 0.22);
      ctx.stroke();

      ctx.strokeStyle = darkBoard ? '#9287ad' : '#1f1b29';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }

    if (cell.landFlash > 0.05) {
      ctx.fillStyle = '#faf6ee';
      ctx.globalAlpha = Math.min(0.45, cell.landFlash * 0.45);
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.restore();
  }

  private drawBlockedObsidianTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    landFlash: number
  ): void {
    const pad = 0.6;
    const bx = x + pad;
    const by = y + pad;
    const bw = Math.max(2, size - pad * 2);
    const bh = Math.max(2, size - pad * 2);
    const radius = Math.max(2, size * 0.14);

    ctx.save();
    const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    grad.addColorStop(0, '#2a2438');
    grad.addColorStop(1, '#16121f');
    ctx.fillStyle = grad;
    this.roundRect(ctx, bx, by, bw, bh, radius);
    ctx.fill();

    ctx.strokeStyle = '#7d719c';
    ctx.lineWidth = Math.max(1.2, size * 0.05);
    this.roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
    ctx.stroke();

    const inset = Math.max(2.5, size * 0.13);
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.26)';
    ctx.lineWidth = 1;
    this.roundRect(
      ctx,
      bx + inset,
      by + inset,
      Math.max(2, bw - inset * 2),
      Math.max(2, bh - inset * 2),
      Math.max(1, radius * 0.5)
    );
    ctx.stroke();

    const markPad = Math.max(4.5, size * 0.28);
    ctx.strokeStyle = '#9287ad';
    ctx.lineWidth = Math.max(1.6, size * 0.085);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + markPad, y + markPad);
    ctx.lineTo(x + size - markPad, y + size - markPad);
    ctx.moveTo(x + size - markPad, y + markPad);
    ctx.lineTo(x + markPad, y + size - markPad);
    ctx.stroke();

    if (landFlash > 0.05) {
      ctx.fillStyle = '#faf6ee';
      ctx.globalAlpha = Math.min(0.4, landFlash * 0.4);
      this.roundRect(ctx, bx, by, bw, bh, radius);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPatternEmblem(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: CellColor,
    emblemColor: string
  ): void {
    ctx.save();
    ctx.strokeStyle = emblemColor;
    ctx.fillStyle = emblemColor;
    ctx.lineWidth = Math.max(1.3, size * 0.06);
    if (color === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2.5, size * 0.19), 0, Math.PI * 2);
      ctx.stroke();
    } else if (color === 1) {
      const r = Math.max(3, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
    } else {
      const r = Math.max(3, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.78);
      ctx.lineTo(cx - r * 0.92, cy + r * 0.78);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderStaticBlockBase(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    size: number,
    color: CellColor,
    skin: SkinConfig,
    joins: NeighborJoins,
    isWild: boolean,
    patternMode: boolean,
    texSeed: number
  ): void {
    const style: BlockStyle = getBlockStyle(skin.palette, color);
    const left = ox;
    const right = joins.right ? ox + size + 0.5 : ox + size;
    const top = oy;
    const bottom = joins.bottom ? oy + size + 0.5 : oy + size;
    const bw = Math.max(2, right - left);
    const bh = Math.max(2, bottom - top);

    const baseR = isWild
      ? Math.max(3, Math.floor(size * 0.2))
      : color === 0
      ? Math.max(3, Math.floor(size * 0.24))
      : color === 2
      ? Math.max(2, Math.floor(size * 0.14))
      : Math.max(1, Math.floor(size * 0.05));
    const rTL = !joins.top && !joins.left ? baseR : 0;
    const rTR = !joins.top && !joins.right ? baseR : 0;
    const rBR = !joins.bottom && !joins.right ? baseR : 0;
    const rBL = !joins.bottom && !joins.left ? baseR : 0;

    this.selectiveRoundRect(ctx, left, top, bw, bh, rTL, rTR, rBR, rBL);
    if (isWild) {
      const sA = getBlockStyle(skin.palette, 0);
      const sB = getBlockStyle(skin.palette, 1);
      const sC = getBlockStyle(skin.palette, 2);
      const prismGrad = ctx.createLinearGradient(left, top, right, bottom);
      prismGrad.addColorStop(0, sA.fill);
      prismGrad.addColorStop(0.5, sC.highlight);
      prismGrad.addColorStop(1, sB.fill);
      ctx.fillStyle = prismGrad;
    } else {
      const bodyGrad = ctx.createLinearGradient(left, top, right, bottom);
      bodyGrad.addColorStop(0, style.fill);
      bodyGrad.addColorStop(1, style.fillGradientEnd);
      ctx.fillStyle = bodyGrad;
    }
    ctx.fill();

    const fillVar = style.fillVariant;
    if (fillVar === 'concentric') {
      const cxT = left + bw * 0.5;
      const cyT = top + bh * 0.5;
      const maxRingR = Math.min(bw, bh) * 0.42;
      ctx.strokeStyle = style.highlight;
      ctx.globalAlpha = 0.31;
      ctx.lineWidth = Math.max(2, size * 0.11);
      ctx.beginPath();
      ctx.arc(cxT, cyT, maxRingR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = style.emblemColor;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = Math.max(1.2, size * 0.055);
      ctx.beginPath();
      ctx.arc(cxT, cyT, maxRingR * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fillVar === 'split_plane') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(left + 1.5, top + 1.5);
      ctx.lineTo(right - 1.5, top + 1.5);
      ctx.lineTo(left + 1.5, bottom - 1.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = style.shade;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.moveTo(right - 1.5, bottom - 1.5);
      ctx.lineTo(right - 1.5, top + 1.5);
      ctx.lineTo(left + 1.5, bottom - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (fillVar === 'wash') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = 0.21;
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.34, top + bh * 0.34, bw * 0.34, bh * 0.24, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.7, top + bh * 0.72, bw * 0.26, bh * 0.2, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (fillVar === 'luminous') {
      const rad = ctx.createRadialGradient(
        left + bw * 0.45,
        top + bh * 0.4,
        1,
        left + bw * 0.5,
        top + bh * 0.5,
        Math.max(bw, bh) * 0.55
      );
      rad.addColorStop(0, style.highlight);
      rad.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.fillStyle = rad;
      ctx.globalAlpha = 0.32;
      ctx.fillRect(left + 1, top + 1, Math.max(1, bw - 2), Math.max(1, bh - 2));
      ctx.globalAlpha = 1;
    } else if (fillVar === 'satin') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.36, top + bh * 0.3, bw * 0.26, bh * 0.16, -0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = 0.07;
      ctx.fillRect(left + 1.5, top + 1.5, Math.max(1, bw - 3), Math.max(1, (bh - 3) * 0.45));
      ctx.globalAlpha = 1;
    }

    const texPad = Math.max(2, Math.floor(size * 0.08));
    this.drawBlockTexture(
      ctx,
      left + texPad,
      top + texPad,
      Math.max(1, bw - texPad * 2),
      Math.max(1, bh - texPad * 2),
      style,
      texSeed
    );

    const bevel = Math.max(1.5, Math.floor(size * 0.085));
    if (!joins.top) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = color === 0 ? 0.56 : 0.68;
      ctx.fillRect(left + (rTL > 0 ? 2 : 0), top, bw - (rTL > 0 ? 2 : 0) - (rTR > 0 ? 2 : 0), bevel);
    }
    if (!joins.left) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = 0.44;
      ctx.fillRect(left, top + (rTL > 0 ? 2 : 0), bevel, bh - (rTL > 0 ? 2 : 0) - (rBL > 0 ? 2 : 0));
    }
    if (!joins.bottom) {
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = color === 0 ? 0.58 : 0.7;
      ctx.fillRect(left + (rBL > 0 ? 2 : 0), bottom - bevel, bw - (rBL > 0 ? 2 : 0) - (rBR > 0 ? 2 : 0), bevel);
    }
    if (!joins.right) {
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = 0.44;
      ctx.fillRect(right - bevel, top + (rTR > 0 ? 2 : 0), bevel, bh - (rTR > 0 ? 2 : 0) - (rBR > 0 ? 2 : 0));
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle =
      color === 0 ? 'rgba(250, 246, 238, 0.22)' : 'rgba(250, 246, 238, 0.14)';
    ctx.lineWidth = 1;
    if (joins.top) {
      ctx.beginPath();
      ctx.moveTo(left + 3, top);
      ctx.lineTo(ox + size - 3, top);
      ctx.stroke();
    }
    if (joins.left) {
      ctx.beginPath();
      ctx.moveTo(left, top + 3);
      ctx.lineTo(left, oy + size - 3);
      ctx.stroke();
    }

    const strokeVar = style.strokeVariant;
    const inset = 0.6;
    if (strokeVar === 'offset_ink') {
      ctx.strokeStyle = style.border;
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.2;
      if (!joins.bottom) {
        ctx.beginPath();
        ctx.moveTo(left + 1.5, oy + size - inset + 0.9);
        ctx.lineTo(ox + size - 0.5, oy + size - inset + 0.9);
        ctx.stroke();
      }
      if (!joins.right) {
        ctx.beginPath();
        ctx.moveTo(ox + size - inset + 0.9, top + 1.5);
        ctx.lineTo(ox + size - inset + 0.9, oy + size - 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = style.border;
    ctx.lineWidth =
      strokeVar === 'painterly'
        ? 1.85
        : color === 0
        ? 1.1
        : color === 2
        ? 1.25
        : 1.35;
    if (!joins.top) {
      ctx.beginPath();
      ctx.moveTo(left + rTL, top + inset);
      ctx.lineTo(ox + size - rTR, top + inset);
      ctx.stroke();
    }
    if (!joins.bottom) {
      ctx.beginPath();
      ctx.moveTo(left + rBL, oy + size - inset);
      ctx.lineTo(ox + size - rBR, oy + size - inset);
      ctx.stroke();
    }
    if (!joins.left) {
      ctx.beginPath();
      ctx.moveTo(left + inset, top + rTL);
      ctx.lineTo(left + inset, oy + size - rBL);
      ctx.stroke();
    }
    if (!joins.right) {
      ctx.beginPath();
      ctx.moveTo(ox + size - inset, top + rTR);
      ctx.lineTo(ox + size - inset, oy + size - rBR);
      ctx.stroke();
    }

    if (strokeVar === 'painterly') {
      ctx.strokeStyle = style.border;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.1;
      if (!joins.top) {
        ctx.beginPath();
        ctx.moveTo(left + rTL + 2, top + 1.9);
        ctx.lineTo(ox + size - rTR - 2, top + 1.4);
        ctx.stroke();
      }
      if (!joins.left) {
        ctx.beginPath();
        ctx.moveTo(left + 1.9, top + rTL + 2);
        ctx.lineTo(left + 1.4, oy + size - rBL - 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (strokeVar === 'double') {
      const innerPad = Math.max(2.6, Math.floor(size * 0.11));
      if (bw > innerPad * 2 + 4 && bh > innerPad * 2 + 4) {
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1;
        this.selectiveRoundRect(
          ctx,
          left + innerPad,
          top + innerPad,
          bw - innerPad * 2,
          bh - innerPad * 2,
          rTL > 0 ? Math.max(1, rTL - 2) : 0,
          rTR > 0 ? Math.max(1, rTR - 2) : 0,
          rBR > 0 ? Math.max(1, rBR - 2) : 0,
          rBL > 0 ? Math.max(1, rBL - 2) : 0
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (strokeVar === 'recessed') {
      ctx.strokeStyle = style.shade;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 1.1;
      if (!joins.top) {
        ctx.beginPath();
        ctx.moveTo(left + 2.5, top + 2.5);
        ctx.lineTo(right - 2.5, top + 2.5);
        ctx.stroke();
      }
      if (!joins.left) {
        ctx.beginPath();
        ctx.moveTo(left + 2.5, top + 2.5);
        ctx.lineTo(left + 2.5, bottom - 2.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (strokeVar === 'corner_ticks') {
      const tick = Math.max(3, Math.floor(size * 0.16));
      const pad = 2.6;
      ctx.strokeStyle = style.emblemColor;
      ctx.globalAlpha = 0.48;
      ctx.lineWidth = 1.1;
      if (!joins.top && !joins.left) {
        ctx.beginPath();
        ctx.moveTo(left + pad, top + pad + tick);
        ctx.lineTo(left + pad, top + pad);
        ctx.lineTo(left + pad + tick, top + pad);
        ctx.stroke();
      }
      if (!joins.bottom && !joins.right) {
        ctx.beginPath();
        ctx.moveTo(right - pad - tick, bottom - pad);
        ctx.lineTo(right - pad, bottom - pad);
        ctx.lineTo(right - pad, bottom - pad - tick);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (patternMode && !isWild) {
      ctx.globalAlpha = 0.7;
      this.drawPatternEmblem(
        ctx,
        left + bw * 0.5,
        top + bh * 0.5,
        size,
        color,
        style.emblemColor
      );
      ctx.globalAlpha = 1;
    }
  }

  private getBlockSprite(
    skin: SkinConfig,
    size: number,
    color: CellColor,
    joins: NeighborJoins,
    isWild: boolean,
    patternMode: boolean,
    texSeed: number
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || size < 6) return null;
    if (this.blockSpriteSkinKey !== skin.id) {
      this.blockSpriteCache.clear();
      this.blockSpriteSkinKey = skin.id;
    }
    const sz = Math.round(size);
    const joinMask =
      (joins.top ? 1 : 0) |
      (joins.right ? 2 : 0) |
      (joins.bottom ? 4 : 0) |
      (joins.left ? 8 : 0);
    const texBucket = ((texSeed % 4) + 4) % 4;
    const key = `${sz}:${color}:${joinMask}:${isWild ? 1 : 0}:${patternMode ? 1 : 0}:${texBucket}`;
    const existing = this.blockSpriteCache.get(key);
    if (existing) return existing;

    if (this.blockSpriteCache.size >= MAX_BLOCK_SPRITES) {
      const oldestKey = this.blockSpriteCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.blockSpriteCache.delete(oldestKey);
      }
    }

    const canvasW = sz + 3;
    const canvasH = sz + 3;
    const sprite = this.createOffscreen(canvasW, canvasH);
    const sctx = sprite.getContext('2d');
    if (sctx) {
      this.renderStaticBlockBase(
        sctx,
        1,
        1,
        sz,
        color,
        skin,
        joins,
        isWild,
        patternMode,
        texBucket
      );
    }
    this.blockSpriteCache.set(key, sprite);
    return sprite;
  }

  private drawBlockCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: CellColor,
    isChain: boolean,
    skin: SkinConfig,
    joins: NeighborJoins,
    fx: {
      row: number;
      col: number;
      inSquare: boolean;
      chainMarked: boolean;
      pendingClear: boolean;
      sweptCol: boolean;
      landFlash: number;
      rippleGlow: number;
      beatPhase: number;
      timeSec: number;
      shimmerWave: number;
      isWild?: boolean;
      isCrashGem?: boolean;
      frostHp?: number;
      isVirus?: boolean;
      patternMode?: boolean;
    }
  ): void {
    const style: BlockStyle = getBlockStyle(skin.palette, color);

    let squashOffset = 0;
    if (fx.landFlash > 0.22) {
      const p = (fx.landFlash - 0.22) / 0.78;
      squashOffset = Math.sin(p * Math.PI * 1.45) * 1.85;
    }

    const dissolveWave = fx.pendingClear
      ? 0.5 + 0.5 * Math.sin(fx.timeSec * 5.2 - fx.col * 0.6)
      : 0;
    const dissolveScale = fx.pendingClear ? 0.92 - dissolveWave * 0.06 : 1;

    const insetShrink = fx.pendingClear ? size * (1 - dissolveScale) * 0.5 : 0;
    const left = x + insetShrink;
    const right = (joins.right && !fx.pendingClear ? x + size + 0.5 : x + size) - insetShrink;
    const top = y + squashOffset + insetShrink;
    const bottom = (joins.bottom && !fx.pendingClear ? y + size + 0.5 : y + size) - insetShrink;
    const bw = Math.max(2, right - left);
    const bh = Math.max(2, bottom - top);

    ctx.save();
    const baseAlpha = fx.pendingClear ? 0.72 + dissolveWave * 0.22 : 1;
    ctx.globalAlpha = baseAlpha;

    const patternOn = Boolean(fx.patternMode);
    const texSeed = fx.row * 7 + fx.col * 13;
    const cachedSprite = !fx.pendingClear
      ? this.getBlockSprite(skin, size, color, joins, Boolean(fx.isWild), patternOn, texSeed)
      : null;

    if (cachedSprite) {
      const ratio = bw / Math.max(1, size);
      ctx.drawImage(
        cachedSprite,
        left - 1,
        top - 1,
        cachedSprite.width * (size / Math.max(1, Math.round(size))) * (ratio >= 1 ? 1 : ratio),
        cachedSprite.height * (size / Math.max(1, Math.round(size)))
      );
    } else {
      this.renderStaticBlockBase(
        ctx,
        left,
        top,
        bw,
        color,
        skin,
        joins,
        Boolean(fx.isWild),
        patternOn,
        texSeed
      );
    }

    if (fx.inSquare) {
      ctx.fillStyle = skin.palette.squareHighlight;
      ctx.globalAlpha = baseAlpha * (0.16 + fx.shimmerWave * 0.24);
      ctx.fillRect(left + 1, top + 1, Math.max(1, bw - 2), Math.max(1, bh - 2));
      const beatAccent = Math.pow(1 - fx.beatPhase, 3);
      if (beatAccent > 0.12 || fx.shimmerWave > 0.45) {
        ctx.fillStyle = '#faf6ee';
        ctx.globalAlpha = baseAlpha * Math.min(0.6, beatAccent * 0.36 + fx.shimmerWave * 0.24);
        ctx.beginPath();
        ctx.arc(left + bw * 0.5, top + bh * 0.5, Math.max(1.5, size * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = baseAlpha;
    }

    if (fx.isWild) {
      const cx = left + bw * 0.5;
      const cy = top + bh * 0.5;
      ctx.fillStyle = '#faf6ee';
      ctx.globalAlpha = baseAlpha * (0.78 + 0.18 * Math.sin(fx.timeSec * 5.2));
      this.drawDiamond(ctx, cx, cy, size * 0.28);
      ctx.strokeStyle = skin.palette.hudAccent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    }

    if (fx.isCrashGem) {
      const cx = left + bw * 0.5;
      const cy = top + bh * 0.5;
      const glint = 0.5 + 0.5 * Math.sin(fx.timeSec * 3.8 + fx.col * 0.9 + fx.row * 0.7);
      ctx.save();
      ctx.strokeStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (0.45 + glint * 0.38);
      ctx.lineWidth = Math.max(1.5, size * 0.075);
      this.roundRect(ctx, left + 1.5, top + 1.5, Math.max(2, bw - 3), Math.max(2, bh - 3), Math.max(2, size * 0.16));
      ctx.stroke();

      const gemR = Math.max(3.5, Math.min(bw, bh) * 0.3);
      ctx.fillStyle = '#faf6ee';
      ctx.globalAlpha = baseAlpha * (0.38 + glint * 0.32);
      this.drawDiamond(ctx, cx, cy, gemR);
      ctx.strokeStyle = style.highlight;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.stroke();

      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * 0.55;
      this.drawDiamond(ctx, cx, cy, gemR * 0.45);
      if (glint > 0.72) {
        const sparkR = gemR * (0.9 + (glint - 0.72) * 1.4);
        ctx.strokeStyle = '#faf6ee';
        ctx.globalAlpha = baseAlpha * (glint - 0.72) * 2.8;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - sparkR, cy);
        ctx.lineTo(cx + sparkR, cy);
        ctx.moveTo(cx, cy - sparkR);
        ctx.lineTo(cx, cy + sparkR);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (fx.isVirus) {
      const cx = left + bw * 0.5;
      const cy = top + bh * 0.5;
      const pad = 2.2;
      const arm = Math.max(3, Math.floor(size * 0.2));
      ctx.save();
      ctx.strokeStyle = '#1f1a2b';
      ctx.lineWidth = Math.max(1.6, size * 0.075);
      ctx.beginPath();
      ctx.moveTo(left + pad, top + pad + arm);
      ctx.lineTo(left + pad, top + pad);
      ctx.lineTo(left + pad + arm, top + pad);
      ctx.moveTo(right - pad - arm, top + pad);
      ctx.lineTo(right - pad, top + pad);
      ctx.lineTo(right - pad, top + pad + arm);
      ctx.moveTo(left + pad, bottom - pad - arm);
      ctx.lineTo(left + pad, bottom - pad);
      ctx.lineTo(left + pad + arm, bottom - pad);
      ctx.moveTo(right - pad - arm, bottom - pad);
      ctx.lineTo(right - pad, bottom - pad);
      ctx.lineTo(right - pad, bottom - pad - arm);
      ctx.stroke();

      const pulseR = Math.max(2.6, Math.min(bw, bh) * (0.2 + 0.04 * Math.sin(fx.timeSec * 5)));
      ctx.strokeStyle = '#faf6ee';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#1f1a2b';
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const chainFill =
      getWcagContrast(style.emblemColor, style.fill) >=
      getWcagContrast('#faf6ee', style.fill)
        ? style.emblemColor
        : '#faf6ee';
    if (isChain) {
      const cx = left + bw * 0.5;
      const cy = top + bh * 0.5;
      const pulse = 1 + 0.12 * Math.sin(fx.timeSec * 6.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      const arm = size * 0.28;
      const thick = size * 0.1;
      ctx.fillStyle = chainFill;
      ctx.fillRect(-arm, -thick / 2, arm * 2, thick);
      ctx.fillRect(-thick / 2, -arm, thick, arm * 2);
      ctx.strokeStyle = chainFill === '#faf6ee' ? style.border : style.highlight;
      ctx.lineWidth = 1;
      ctx.strokeRect(-arm, -thick / 2, arm * 2, thick);
      ctx.restore();
    }

    if (fx.chainMarked) {
      ctx.strokeStyle = chainFill;
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 2, top + 2, bw - 4, bh - 4);
    }

    if (fx.sweptCol) {
      ctx.fillStyle = skin.palette.squareHighlight;
      ctx.globalAlpha = baseAlpha * 0.24;
      ctx.fillRect(left, top, bw, bh);
    }

    const frostHp = fx.frostHp ?? 0;
    if (frostHp > 0) {
      ctx.save();
      ctx.fillStyle = frostHp >= 2 ? 'rgba(232, 246, 255, 0.44)' : 'rgba(232, 246, 255, 0.24)';
      ctx.fillRect(left + 1, top + 1, Math.max(1, bw - 2), Math.max(1, bh - 2));
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = frostHp >= 2 ? 0.78 : 0.52;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(left + 1.5, top + 1.5, Math.max(2, bw - 3), Math.max(2, bh - 3));
      const tri = Math.max(3, Math.floor(size * 0.22));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.moveTo(left + 1, top + 1);
      ctx.lineTo(left + 1 + tri, top + 1);
      ctx.lineTo(left + 1, top + 1 + tri);
      ctx.closePath();
      ctx.fill();

      if (frostHp === 1) {
        ctx.strokeStyle = '#243247';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(left + bw * 0.2, top + 2);
        ctx.lineTo(left + bw * 0.5, top + bh * 0.45);
        ctx.lineTo(left + bw * 0.34, top + bh * 0.72);
        ctx.lineTo(left + bw * 0.68, bottom - 2);
        ctx.moveTo(left + bw * 0.5, top + bh * 0.45);
        ctx.lineTo(left + bw * 0.84, top + bh * 0.36);
        ctx.stroke();
      }
      ctx.restore();
    }

    const totalWash = Math.min(0.42, fx.landFlash * 0.34 + fx.rippleGlow);
    if (totalWash > 0.01) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * totalWash;
      ctx.fillRect(left, top, bw, bh);
    }

    ctx.restore();
  }

  private drawBlockTexture(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    style: BlockStyle,
    cellHash = 0
  ): void {
    ctx.save();
    switch (style.texture) {
      case 'woodcut_ink':
        ctx.strokeStyle = style.border;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 1;
        for (let d = -h; d < w + h; d += 6) {
          ctx.beginPath();
          ctx.moveTo(x + d, y);
          ctx.lineTo(x + d - h * 0.5, y + h);
          ctx.stroke();
        }
        break;
      case 'watercolor':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(x + w * 0.35, y + h * 0.35, w * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = style.shade;
        ctx.beginPath();
        ctx.arc(x + w * 0.75, y + h * 0.72, w * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'clay_glyph':
      case 'carved_stone':
        ctx.strokeStyle = style.shade;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);
        break;
      case 'cut_paper':
        ctx.fillStyle = 'rgba(250, 246, 238, 0.18)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x, y + h * 0.65);
        ctx.closePath();
        ctx.fill();
        break;
      case 'gouache':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.42, y + h * 0.34, w * 0.3, h * 0.12, -0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'silk_sand':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.2;
        for (let ry = 0.28; ry <= 0.76; ry += 0.24) {
          ctx.beginPath();
          ctx.moveTo(x, y + h * ry);
          ctx.quadraticCurveTo(x + w * 0.5, y + h * (ry - 0.1), x + w, y + h * ry);
          ctx.stroke();
        }
        break;
      case 'enamel_pop':
        ctx.fillStyle = 'rgba(250, 246, 238, 0.26)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.3, y + h * 0.24, w * 0.18, h * 0.08, -0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'crt_noir':
        ctx.fillStyle = 'rgba(34, 30, 44, 0.12)';
        for (let sy = y + 2; sy < y + h; sy += 4) {
          ctx.fillRect(x, sy, w, 1);
        }
        break;
      case 'art_deco':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.28);
        ctx.lineTo(x + w * 0.28, y);
        ctx.moveTo(x + w, y + h * 0.72);
        ctx.lineTo(x + w * 0.72, y + h);
        ctx.stroke();
        break;
      case 'crystal_prism':
        ctx.fillStyle = 'rgba(250, 246, 238, 0.22)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w * 0.5, y + h * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      case 'pixel_bevel':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x + 4, y + 4, Math.max(2, w - 8), Math.max(2, h - 8));
        break;
      case 'brass_rivet':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.5;
        [
          [x + 4, y + 4],
          [x + w - 4, y + 4],
          [x + 4, y + h - 4],
          [x + w - 4, y + h - 4],
        ].forEach(([rx, ry]) => {
          ctx.beginPath();
          ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      case 'bioluminescent':
      case 'pearl_shell':
      case 'foil_velvet':
        ctx.fillStyle = 'rgba(250, 246, 238, 0.20)';
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.34, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ligne_claire':
        ctx.strokeStyle = style.border;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.14, y + h * 0.84);
        ctx.lineTo(x + w * 0.84, y + h * 0.14);
        ctx.stroke();
        break;
      case 'graphite':
        ctx.strokeStyle = style.shade;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        for (let gy = 0.25; gy <= 0.75; gy += 0.25) {
          ctx.beginPath();
          ctx.moveTo(x + 2, y + h * gy);
          ctx.lineTo(x + w - 2, y + h * gy - 1.5);
          ctx.stroke();
        }
        break;
      case 'lacquer':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.roundRect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.16, 2);
        ctx.fill();
        break;
      case 'vector_matte':
        ctx.fillStyle = style.shade;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x, y + h * 0.68, w, h * 0.32);
        break;
      case 'city_windows':
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.26;
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 3; c++) {
            if ((cellHash + r * 3 + c) % 4 === 0) continue;
            ctx.fillRect(
              x + w * (0.14 + c * 0.28),
              y + h * (0.22 + r * 0.36),
              Math.max(2, w * 0.16),
              Math.max(2, h * 0.18)
            );
          }
        }
        break;
      case 'target_rings':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, Math.min(w, h) * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'impasto_stroke':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.15, y + h * 0.72);
        ctx.lineTo(x + w * 0.74, y + h * 0.22);
        ctx.moveTo(x + w * 0.35, y + h * 0.85);
        ctx.lineTo(x + w * 0.85, y + h * 0.42);
        ctx.stroke();
        break;
      case 'terrazzo_speckle':
        ctx.globalAlpha = 0.3;
        [
          [0.24, 0.28, style.highlight],
          [0.72, 0.25, style.shade],
          [0.48, 0.55, style.emblemColor],
          [0.28, 0.76, style.shade],
          [0.76, 0.74, style.highlight],
        ].forEach(([fx, fy, col]) => {
          ctx.fillStyle = col as string;
          ctx.beginPath();
          ctx.arc(x + w * (fx as number), y + h * (fy as number), Math.max(1.2, w * 0.055), 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      case 'stipple_dots':
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.24;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if ((r + c) % 2 !== 0) continue;
            ctx.beginPath();
            ctx.arc(x + w * (0.22 + c * 0.28), y + h * (0.22 + r * 0.28), 1.15, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      case 'linen_weave':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 1;
        for (let p = 0.28; p <= 0.76; p += 0.24) {
          ctx.beginPath();
          ctx.moveTo(x + 1, y + h * p);
          ctx.lineTo(x + w - 1, y + h * p);
          ctx.moveTo(x + w * p, y + 1);
          ctx.lineTo(x + w * p, y + h - 1);
          ctx.stroke();
        }
        break;
      case 'risograph_dots':
        ctx.fillStyle = style.shade;
        ctx.globalAlpha = 0.22;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.beginPath();
            ctx.arc(x + w * (0.2 + c * 0.3), y + h * (0.2 + r * 0.3), 1.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      case 'fresco_crackle':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.18, y + h * 0.16);
        ctx.lineTo(x + w * 0.48, y + h * 0.44);
        ctx.lineTo(x + w * 0.82, y + h * 0.38);
        ctx.moveTo(x + w * 0.48, y + h * 0.44);
        ctx.lineTo(x + w * 0.38, y + h * 0.82);
        ctx.stroke();
        break;
      case 'sumi_brush':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.14, y + h * 0.26);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.14, x + w * 0.86, y + h * 0.34);
        ctx.moveTo(x + w * 0.22, y + h * 0.72);
        ctx.quadraticCurveTo(x + w * 0.54, y + h * 0.62, x + w * 0.84, y + h * 0.78);
        ctx.stroke();
        break;
      case 'washi_fiber':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.15, y + h * 0.35);
        ctx.lineTo(x + w * 0.42, y + h * 0.24);
        ctx.moveTo(x + w * 0.55, y + h * 0.66);
        ctx.lineTo(x + w * 0.86, y + h * 0.48);
        ctx.moveTo(x + w * 0.24, y + h * 0.78);
        ctx.lineTo(x + w * 0.48, y + h * 0.84);
        ctx.stroke();
        break;
      case 'cubist_facet':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.78, y + h * 0.24);
        ctx.lineTo(x + w * 0.28, y + h * 0.88);
        ctx.closePath();
        ctx.fill();
        break;
      case 'visor_hud':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.15, y + h * 0.22);
        ctx.lineTo(x + w * 0.85, y + h * 0.22);
        ctx.moveTo(x + w * 0.15, y + h * 0.78);
        ctx.lineTo(x + w * 0.6, y + h * 0.78);
        ctx.stroke();
        break;
      case 'chrome_plate':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.24;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.1, y);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.18, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        break;
      case 'neon_louvre':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.24;
        for (let ly = 0.22; ly <= 0.76; ly += 0.26) {
          ctx.fillRect(x + 1, y + h * ly, w - 2, Math.max(1.4, h * 0.08));
        }
        break;
      case 'chakana_step':
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.24;
        ctx.fillRect(x + w * 0.36, y + h * 0.18, w * 0.28, h * 0.64);
        ctx.fillRect(x + w * 0.18, y + h * 0.36, w * 0.64, h * 0.28);
        break;
      case 'aguayo_weave':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.5);
        ctx.lineTo(x + w * 0.5, y + h * 0.16);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.lineTo(x + w * 0.5, y + h * 0.84);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'cat_doodle':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.26, y + h * 0.48);
        ctx.lineTo(x + w * 0.3, y + h * 0.24);
        ctx.lineTo(x + w * 0.42, y + h * 0.38);
        ctx.lineTo(x + w * 0.58, y + h * 0.38);
        ctx.lineTo(x + w * 0.7, y + h * 0.24);
        ctx.lineTo(x + w * 0.74, y + h * 0.48);
        ctx.arc(x + w * 0.5, y + h * 0.56, w * 0.24, 0, Math.PI, false);
        ctx.stroke();
        break;
      case 'paw_print':
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.24;
        this.fillCircle(ctx, x + w * 0.5, y + h * 0.62, Math.max(1.8, w * 0.14));
        this.fillCircle(ctx, x + w * 0.3, y + h * 0.38, Math.max(1.1, w * 0.075));
        this.fillCircle(ctx, x + w * 0.5, y + h * 0.3, Math.max(1.1, w * 0.075));
        this.fillCircle(ctx, x + w * 0.7, y + h * 0.38, Math.max(1.1, w * 0.075));
        break;
      case 'stained_glass':
        ctx.strokeStyle = style.border;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y);
        ctx.lineTo(x + w * 0.5, y + h);
        ctx.moveTo(x, y + h * 0.5);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.stroke();
        break;
      case 'constructivist_wedge':
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.14, y + h * 0.84);
        ctx.lineTo(x + w * 0.86, y + h * 0.22);
        ctx.lineTo(x + w * 0.86, y + h * 0.84);
        ctx.closePath();
        ctx.fill();
        break;
      case 'leaf_vein':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, y + h * 0.78);
        ctx.lineTo(x + w * 0.78, y + h * 0.22);
        ctx.moveTo(x + w * 0.42, y + h * 0.58);
        ctx.lineTo(x + w * 0.36, y + h * 0.32);
        ctx.moveTo(x + w * 0.56, y + h * 0.44);
        ctx.lineTo(x + w * 0.76, y + h * 0.52);
        ctx.stroke();
        break;
      case 'petal_press':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.32, w * 0.14, h * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + w * 0.34, y + h * 0.62, w * 0.14, h * 0.18, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + w * 0.66, y + h * 0.62, w * 0.14, h * 0.18, 0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'memphis_squiggle':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.18, y + h * 0.64);
        ctx.lineTo(x + w * 0.36, y + h * 0.34);
        ctx.lineTo(x + w * 0.54, y + h * 0.64);
        ctx.lineTo(x + w * 0.72, y + h * 0.34);
        ctx.lineTo(x + w * 0.86, y + h * 0.56);
        ctx.stroke();
        break;
      case 'scandi_birch':
        ctx.strokeStyle = style.shade;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.16, y + h * 0.28);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.20, x + w * 0.84, y + h * 0.30);
        ctx.moveTo(x + w * 0.16, y + h * 0.72);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.80, x + w * 0.84, y + h * 0.70);
        ctx.stroke();
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.26;
        this.fillCircle(ctx, x + w * 0.22, y + h * 0.22, 1.5);
        this.fillCircle(ctx, x + w * 0.78, y + h * 0.78, 1.5);
        break;
      case 'flatpack_blueprint':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = 1;
        ctx.setLineDash([2.5, 2.5]);
        ctx.strokeRect(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.64);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.18, y + h * 0.5);
        ctx.lineTo(x + w * 0.42, y + h * 0.5);
        ctx.stroke();
        break;
      case 'hotel_keycard':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.1;
        this.roundRect(ctx, x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68, 5);
        ctx.stroke();
        break;
      case 'de_stijl_grid':
        ctx.fillStyle = style.border;
        ctx.globalAlpha = 0.34;
        ctx.fillRect(x + w * 0.28, y + h * 0.12, 2, h * 0.76);
        ctx.fillRect(x + w * 0.12, y + h * 0.64, w * 0.76, 2);
        break;
      case 'woodblock_wave':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1.1;
        for (let r = 0.24; r <= 0.48; r += 0.12) {
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.85, w * r, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
        break;
      case 'kodak_slide':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x + w * 0.18, y + h * 0.22, w * 0.64, h * 0.56);
        ctx.fillStyle = style.emblemColor;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(x + w * 0.24, y + h * 0.12, 3, 2);
        ctx.fillRect(x + w * 0.48, y + h * 0.12, 3, 2);
        ctx.fillRect(x + w * 0.72, y + h * 0.12, 3, 2);
        break;
      case 'bauhaus_arc':
        ctx.fillStyle = style.highlight;
        ctx.globalAlpha = 0.24;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.16, y + h * 0.84);
        ctx.arc(x + w * 0.16, y + h * 0.84, w * 0.58, -Math.PI / 2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case 'terrarium_hex':
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, y + h * 0.18);
        ctx.lineTo(x + w * 0.7, y + h * 0.18);
        ctx.lineTo(x + w * 0.84, y + h * 0.5);
        ctx.lineTo(x + w * 0.7, y + h * 0.82);
        ctx.lineTo(x + w * 0.3, y + h * 0.82);
        ctx.lineTo(x + w * 0.16, y + h * 0.5);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'vinyl_groove':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.24, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'space_porthole':
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.36;
        ctx.lineWidth = 1.6;
        this.roundRect(ctx, x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.64, w * 0.22);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  private drawSweepFlares(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_FLARES; i++) {
      const flare = this.sweepFlares[i];
      if (!flare.active) continue;
      const t = flare.life / flare.maxLife;
      const fade = (1 - t) * (1 - t);
      const halfW = flare.width * (0.48 + t * 0.35);
      const halfH = flare.height * (0.35 + t * 0.4);
      const grad = ctx.createLinearGradient(
        0,
        flare.y - halfH,
        0,
        flare.y + halfH
      );
      grad.addColorStop(0, 'rgba(250, 246, 238, 0)');
      grad.addColorStop(0.5, flare.color);
      grad.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.save();
      ctx.globalAlpha = fade * 0.18;
      ctx.fillStyle = grad;
      ctx.fillRect(flare.x - halfW, flare.y - halfH, halfW * 2, halfH * 2);
      ctx.restore();
    }
  }

  private drawClearRings(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = this.clearRings[i];
      if (!ring.active) continue;
      const t = ring.life / ring.maxLife;
      const eased = 1 - Math.pow(1 - t, 2);
      const radius = 6 + ring.maxRadius * eased;
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = (1 - t) * 0.65;
      ctx.lineWidth = Math.max(1, (1 - t) * 3);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      ctx.save();
      if (p.isGlint) {
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.shape === 'bubble' || p.shape === 'ink') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'petal') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.65, p.size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'star') {
        ctx.fillStyle = p.color;
        const outer = p.size * 0.72;
        const inner = p.size * 0.24;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 === 0 ? outer : inner;
          const a = (k * Math.PI) / 4;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.fillStyle = p.color;
        const outer = p.size * 0.85;
        const thin = p.size * 0.18;
        ctx.beginPath();
        ctx.moveTo(0, -outer);
        ctx.lineTo(thin, -thin);
        ctx.lineTo(outer, 0);
        ctx.lineTo(thin, thin);
        ctx.lineTo(0, outer);
        ctx.lineTo(-thin, thin);
        ctx.lineTo(-outer, 0);
        ctx.lineTo(-thin, -thin);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'diamond') {
        ctx.fillStyle = p.color;
        this.drawDiamond(ctx, 0, 0, p.size * 0.55);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_POPUPS; i++) {
      const pop = this.popups[i];
      if (!pop.active) continue;
      const t = pop.life / pop.maxLife;
      const alpha = t < 0.06 ? t / 0.06 : t > 0.78 ? Math.max(0, (1 - t) / 0.22) : 1;
      const popScale = t < 0.1 ? 0.88 + (t / 0.1) * 0.18 : 1 + Math.max(0, 0.25 - t) * 0.2;
      const rect =
        pop.boardIdx === 1 && this.lastSecondaryRect
          ? this.lastSecondaryRect
          : this.lastPrimaryRect;
      const anchorX = pop.followBoard ? rect.x + rect.width * 0.5 : pop.x;
      const anchorY = pop.followBoard ? rect.y + rect.height * 0.32 - t * 14 : pop.y;
      const isBrightText = getHexLuminance(pop.color) > 0.54;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(anchorX, anchorY);
      ctx.scale(popScale, popScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
      const titleW = ctx.measureText(pop.text).width;
      let subW = 0;
      if (pop.subtext) {
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        subW = ctx.measureText(pop.subtext).width;
      }
      const boxW = Math.max(titleW, subW) + 30;
      const boxH = pop.subtext ? 50 : 34;
      const boxX = -boxW * 0.5;
      const boxY = pop.subtext ? -21 : -17;

      ctx.fillStyle = isBrightText ? 'rgba(20, 18, 30, 0.92)' : 'rgba(252, 248, 242, 0.96)';
      this.selectiveRoundRect(ctx, boxX, boxY, boxW, boxH, 11, 11, 11, 11);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = pop.color;
      ctx.stroke();

      ctx.fillStyle = pop.color;
      ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(pop.text, 0, pop.subtext ? -5 : 0);
      if (pop.subtext) {
        ctx.fillStyle = isBrightText ? 'rgba(252, 248, 242, 0.94)' : 'rgba(24, 21, 34, 0.88)';
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(pop.subtext, 0, 15);
      }
      ctx.restore();
    }
  }

  private fillCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDiamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  private selectiveRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rTL: number,
    rTR: number,
    rBR: number,
    rBL: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + rTL, y);
    ctx.lineTo(x + w - rTR, y);
    if (rTR > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + rTR);
    else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - rBR);
    if (rBR > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - rBR, y + h);
    else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + rBL, y + h);
    if (rBL > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - rBL);
    else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + rTL);
    if (rTL > 0) ctx.quadraticCurveTo(x, y, x + rTL, y);
    else ctx.lineTo(x, y);
    ctx.closePath();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
