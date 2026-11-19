import {
  BOARD_COLS,
  BOARD_ROWS,
  LOCK_DELAY_SEC,
  canPlacePiece,
  getDiagonalSlantSpan,
  getGravityVector,
  getPieceLandingColumns,
} from './engine';
import { getBlockStyle, getHexLuminance, isHexColorDark } from './skins';
import {
  BlockStyle,
  BoardOrientation,
  BoardState,
  Cell,
  CellColor,
  GravityDirection,
  Piece,
  SkinConfig,
} from './types';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  rotation: number;
  vRot: number;
  shape: SkinConfig['particleShape'] | 'star' | 'diamond';
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

const MAX_PARTICLES = 180;
const MAX_RINGS = 64;
const MAX_FLARES = 36;
const MAX_POPUPS = 16;
const MAX_MOTES = 42;
const MAX_LAND_RIPPLES = 16;
const MAX_DROP_BEAMS = 12;
const PARALLAX_OVERSCAN_X = 56;
const PARALLAX_OVERSCAN_Y = 24;

export class IluminadoCanvasRenderer {
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 6,
    alpha: 1,
    life: 0,
    maxLife: 0.6,
    color: '#faf6ee',
    rotation: 0,
    vRot: 0,
    shape: 'square',
  }));
  private particleCursor = 0;

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
  };

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
    // Slide sideways + elevate during orientation pivot for tactile diorama continuity
    const dir = toOrientation === 'portrait' ? 1 : -1;
    this.shiftAnimT = 1;
    this.shiftFromX = dir * 135;
    this.shiftFromY = toOrientation === 'portrait' ? 42 : -36;
    this.shiftScaleFrom = toOrientation === 'portrait' ? 0.94 : 1.05;
    // Whip camera parallax gently across the horizon when flipping device orientation
    this.targetParallaxX = dir * 32;
    this.sweepBloom = Math.min(1.2, Math.max(this.sweepBloom, 0.45));
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
  }

  public spawnClearBurst(
    boardIdx: 0 | 1,
    positions: Array<{ x: number; y: number; color: CellColor }>,
    skin: SkinConfig
  ): void {
    const rect =
      boardIdx === 1 && this.lastSecondaryRect
        ? this.lastSecondaryRect
        : this.lastPrimaryRect;
    for (const pos of positions) {
      const cx = rect.x + (pos.x + 0.5) * rect.cellSize;
      const cy = rect.y + (pos.y + 0.5) * rect.cellSize;
      const style = getBlockStyle(skin.palette, pos.color);

      // Joyful clear burst: 2 shaped motes + 1 rising 4-point star/diamond glint per tile
      for (let i = 0; i < 3; i++) {
        const p = this.particles[this.particleCursor];
        this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
        const spread = i === 0 ? -0.58 : i === 1 ? 0.58 : 0;
        const angle = -Math.PI * 0.5 + spread + (Math.random() - 0.5) * 0.45;
        const speed = i === 2 ? 28 + Math.random() * 34 : 16 + Math.random() * 28;
        p.active = true;
        p.x = cx + (i - 1) * rect.cellSize * 0.14;
        p.y = cy;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - (i === 2 ? 18 : 12);
        p.size = rect.cellSize * (i === 2 ? 0.22 + Math.random() * 0.1 : 0.13 + Math.random() * 0.08);
        p.alpha = i === 2 ? 0.85 : 0.62;
        p.life = 0;
        p.maxLife = (i === 2 ? 0.65 : 0.55) + Math.random() * 0.3;
        p.color =
          i === 2
            ? skin.palette.squareHighlight
            : i === 0
            ? style.highlight
            : style.fill;
        p.rotation = Math.random() * Math.PI;
        p.vRot = (Math.random() - 0.5) * (i === 2 ? 4.5 : 2.2);
        p.shape =
          i === 2
            ? pos.color === 0
              ? 'star'
              : 'diamond'
            : pos.color === 0
            ? 'bubble'
            : skin.particleShape;
      }

      // Soft expanding water ripple halo on clear
      const ring = this.clearRings[this.ringCursor];
      this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
      ring.active = true;
      ring.x = cx;
      ring.y = cy;
      ring.maxRadius = rect.cellSize * 1.15;
      ring.life = 0;
      ring.maxLife = 0.5;
      ring.color = style.highlight;

      // Subtle vertical translucent wake veil
      const flare = this.sweepFlares[this.flareCursor];
      this.flareCursor = (this.flareCursor + 1) % MAX_FLARES;
      flare.active = true;
      flare.x = cx;
      flare.y = cy;
      flare.width = rect.cellSize * 0.78;
      flare.height = rect.height * 0.82;
      flare.life = 0;
      flare.maxLife = 0.55;
      flare.color = style.highlight;
    }
  }

  public spawnPeggleBounce(
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

    for (let i = 0; i < 4; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const angle = (Math.PI * 2 * i) / 4 + Math.random() * 0.6;
      const speed = 26 + Math.random() * 28;
      p.active = true;
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = rect.cellSize * (0.14 + Math.random() * 0.08);
      p.alpha = 0.85;
      p.life = 0;
      p.maxLife = 0.36 + Math.random() * 0.14;
      p.color = i % 2 === 0 ? skin.palette.squareHighlight : skin.palette.hudAccent;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 6;
      p.shape = i % 2 === 0 ? 'star' : 'bubble';
    }

    const ring = this.clearRings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    ring.active = true;
    ring.x = cx;
    ring.y = cy;
    ring.maxRadius = rect.cellSize * 0.82;
    ring.life = 0;
    ring.maxLife = 0.32;
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
    pop.x = rect.x + rect.width * 0.5;
    pop.y = rect.y + rect.height * 0.34;
    pop.text = text;
    pop.subtext = subtext;
    pop.life = 0;
    pop.maxLife = 1.2;
    pop.color = color;
  }

  public updateEffects(dt: number, gridList: (Cell | null)[][][]): void {
    const damp = 1 - Math.exp(-dt * 3.8);
    this.parallaxX += (this.targetParallaxX - this.parallaxX) * damp;
    this.parallaxY += (this.targetParallaxY - this.parallaxY) * damp;
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

    // Hold brick fallOffset steady while the board pivots 90 deg, then drop bricks to the new bottom
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
      p.vx *= 1 - Math.min(1, dt * 1.8);
      p.vy += -18 * dt;
      p.rotation += p.vRot * dt;
      const norm = p.life / p.maxLife;
      p.alpha = 0.58 * (1 - norm) * (1 - norm);
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
        // Promote the just-left world directly into prevLayerCache to avoid rebuilding it
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
    ctx.drawImage(layers.far, -ox - px * 0.28, layers.farTop - oy - py * 0.22);
    ctx.drawImage(layers.mid, -ox - px * 0.62, -oy - py * 0.52);
    ctx.drawImage(layers.near, -ox - px * 1.05, layers.nearTop - oy - py * 0.88);
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

    const primaryCols = primaryBoard
      ? primaryBoard.grid[0]?.length ?? primaryBoard.cols ?? BOARD_COLS
      : BOARD_COLS;
    const primaryRows = primaryBoard
      ? primaryBoard.grid.length ?? primaryBoard.rows ?? BOARD_ROWS
      : BOARD_ROWS;

    // Update target camera parallax from player piece movement or gentle title drift
    if (!isTitleScreen && primaryBoard?.activePiece) {
      const piece = primaryBoard.activePiece;
      const moveNormX = ((piece.x + 1) / primaryCols - 0.5) * 2;
      const moveNormY = Math.max(-0.4, Math.min(1, piece.y / primaryRows - 0.35));
      this.targetParallaxX =
        moveNormX * 26 + this.pointerNormX * 6 + Math.sin(timeSec * 0.16) * 5;
      this.targetParallaxY =
        moveNormY * 10 + this.pointerNormY * 3 + Math.cos(timeSec * 0.12) * 3;
    } else {
      this.targetParallaxX =
        this.pointerNormX * 22 + Math.sin(timeSec * 0.18) * 14;
      this.targetParallaxY =
        this.pointerNormY * 10 + Math.cos(timeSec * 0.14) * 5;
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
      // Smooth cubic ease for orientation slide-and-lift transition
      const shiftEase =
        this.shiftAnimT > 0 ? Math.pow(this.shiftAnimT, 2.2) : 0;
      const shiftDx = this.shiftFromX * shiftEase;
      const shiftDy = this.shiftFromY * shiftEase;
      const shiftScale = 1 + (this.shiftScaleFrom - 1) * shiftEase;

      // 90-degree board rotation pivot on level change
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
        const bottomMargin = isDesktopWide ? 58 : isPortrait ? 148 : 22;
        const leftReserve = isDesktopWide ? 148 : isCompactLandscape ? 128 : 14;
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
        // Slightly elevated ("moved up") bias in portrait so lower courtyard horizon/water breathes cleanly
        const slackBias = isPortrait ? 0.38 : 0.45;
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
        if (shiftEase > 0.002) {
          const pivotCx = startX + boardW * 0.5;
          const pivotCy = startY + boardH * 0.5;
          ctx.translate(pivotCx + shiftDx, pivotCy + shiftDy);
          ctx.scale(shiftScale, shiftScale);
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

        // Glowing architectural pivot guide bracket while screen orientation settles
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

    // Zen acoustic mandala halo behind central stage (responds smoothly to both beat & audio spectrum)
    const mandalaX =
      (isTitleScreen ? width * 0.62 : width * 0.5) - this.parallaxX * 0.38;
    const mandalaY =
      (isTitleScreen ? height * 0.46 : height * 0.48) - this.parallaxY * 0.28;
    const baseOrbR =
      Math.min(width, height) *
      (0.28 + beatPulse * 0.02 + subBass * 0.036 + this.sweepBloom * 0.045);

    const glowSprite = this.getMandalaGlowSprite();
    if (glowSprite) {
      const glowR = baseOrbR * 1.38;
      ctx.drawImage(glowSprite, mandalaX - glowR, mandalaY - glowR, glowR * 2, glowR * 2);
    }

    // Soft translucent breathing mandala ring + orbiting geometric petals
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

    // Soft drifting mist wisps across sky/midground with subtle parallax + gentle move reaction
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

    // Layered soft glowing celestial solar discs (shape-forward, zero harsh lines)
    const sunX = width * 0.72 - this.parallaxX * 0.18;
    const sunY = height * 0.24 - this.parallaxY * 0.14;
    const pulseR =
      Math.min(width, height) * (0.1 + beatPulse * 0.024 + subBass * 0.022);
    ctx.fillStyle = palette.architectureLight;
    ctx.globalAlpha = 0.07 + beatPulse * 0.04 + mid * 0.05;
    ctx.beginPath();
    ctx.arc(sunX, sunY, pulseR * 1.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.12 + beatPulse * 0.06 + high * 0.06;
    ctx.beginPath();
    ctx.arc(sunX, sunY, pulseR * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // Theme-authentic subtle shape-rich background animations
    if (
      theme === 'monument_valley' ||
      theme === 'old_mans_journey' ||
      theme === 'sennaar' ||
      theme === 'hyper_light' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'ochre_skyline'
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
    } else if (theme === 'gorogoa' || theme === 'transistor' || theme === 'sayonara' || theme === 'indigo_risograph') {
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
      const lanternXs = [width * 0.1, width * 0.18, width * 0.84, width * 0.91];
      const lanternYs = [height * 0.25, height * 0.36, height * 0.24, height * 0.38];
      lanternXs.forEach((lx, idx) => {
        const ly = lanternYs[idx] - this.parallaxY * 0.62;
        const sway = Math.sin(timeSec * 1.1 + idx * 1.7) * 5 - this.parallaxX * 0.62;
        ctx.fillStyle = palette.blockA.highlight;
        ctx.globalAlpha = 0.14 + beatPulse * 0.1;
        ctx.beginPath();
        ctx.arc(lx + sway, ly + 14, 24 + beatPulse * 6, 0, Math.PI * 2);
        ctx.fill();
      });
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
      const glowPts = [0.09, 0.15, 0.85, 0.91];
      ctx.fillStyle = palette.blockA.highlight;
      glowPts.forEach((rx, idx) => {
        const px = width * rx - this.parallaxX * 0.62;
        const py = height * (0.42 + (idx % 2) * 0.12) - this.parallaxY * 0.52;
        ctx.globalAlpha = 0.16 + beatPulse * 0.1 + 0.08 * Math.sin(timeSec * 2 + idx);
        this.roundRect(ctx, px - 12, py - 5, 24, 10, 4);
        ctx.fill();
      });
    } else if (theme === 'noland_target' || theme === 'artisan_blocks') {
      const cxPositions = [width * 0.12, width * 0.88];
      cxPositions.forEach((tx, idx) => {
        const px = tx - this.parallaxX * 0.62;
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
      });
    } else if (theme === 'limbo_inside') {
      const swayX = width * 0.5 + Math.sin(timeSec * 0.32) * 32 - this.parallaxX * 0.4;
      const spot = ctx.createRadialGradient(swayX, 0, 20, swayX, height * 0.65, width * 0.36);
      spot.addColorStop(0, 'rgba(250, 246, 238, 0.14)');
      spot.addColorStop(1, 'rgba(250, 246, 238, 0)');
      ctx.fillStyle = spot;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, width, height);
    } else {
      // Shape-rich floating geometric pebbles for any remaining themes (gris, fez, papetura, hohokum, kentucky_rz)
      for (let i = 0; i < 6; i++) {
        const angle = timeSec * 0.14 + i * 1.1;
        const px = width * (0.08 + ((i * 0.17) % 0.84)) + Math.cos(angle) * 14 - this.parallaxX * 0.65;
        const py = height * (0.22 + ((i * 0.14) % 0.48)) + Math.sin(angle * 1.3) * 12 - this.parallaxY * 0.5;
        ctx.fillStyle = i % 2 === 0 ? palette.blockA.highlight : palette.blockB.highlight;
        ctx.globalAlpha = 0.09 + beatPulse * 0.05;
        ctx.beginPath();
        ctx.arc(px, py, 12 + (i % 3) * 7 + subBass * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Music-reactive soft rounded capsule shapes along the waterline (shape-forward, minimal lines)
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

    // Encore Finale heightened aurora ribbons across upper sky
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

    // Shape-matched floating ambient motes with depth-scaled parallax drift
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
    skyGrad.addColorStop(0.45, palette.skyMid);
    skyGrad.addColorStop(0.76, palette.skyBottom);
    skyGrad.addColorStop(1, palette.waterSurface);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    if (
      theme === 'monument_valley' ||
      theme === 'sennaar' ||
      theme === 'kentucky_rz' ||
      theme === 'hyper_light' ||
      theme === 'fez' ||
      theme === 'spiritfarer' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'ochre_skyline'
    ) {
      ctx.fillStyle = palette.waterSurface;
      ctx.fillRect(0, horizonY, width, height - horizonY);
    }

    const sunX = width * 0.72;
    const sunY = height * 0.24;
    const sunR = Math.min(width, height) * 0.15;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.2);
    sunGrad.addColorStop(0, 'rgba(255, 252, 246, 0.70)');
    sunGrad.addColorStop(0.45, 'rgba(255, 248, 240, 0.20)');
    sunGrad.addColorStop(1, 'rgba(255, 248, 240, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
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
    // Distant terraced pastel skyline / ridge common across worlds (atmospheric fade)
    ctx.fillStyle = palette.architectureMid;
    ctx.globalAlpha = 0.26;
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

    // Distant isometric background spires / colonnades for architectural depth
    if (
      theme === 'monument_valley' ||
      theme === 'sennaar' ||
      theme === 'fez' ||
      theme === 'hyper_light' ||
      theme === 'transistor' ||
      theme === 'sable' ||
      theme === 'verdigris_terrace' ||
      theme === 'terracotta_mosaic' ||
      theme === 'aurora_prism'
    ) {
      ctx.globalAlpha = 0.34;
      this.drawIsoTower(ctx, width * 0.26, horizonY - 8, 62, 118, skin, true, false);
      this.drawIsoTower(ctx, width * 0.72, horizonY - 6, 68, 134, skin, true, true);
      this.drawIsoTower(ctx, width * 0.42, horizonY - 14, 48, 86, skin, false, false);
    }

    // Soft atmospheric horizon mist veil separating far plane from mid architecture
    const mistGrad = ctx.createLinearGradient(0, horizonY - 95, 0, horizonY + 20);
    mistGrad.addColorStop(0, 'rgba(250, 246, 238, 0)');
    mistGrad.addColorStop(0.65, palette.horizonMist);
    mistGrad.addColorStop(1, 'rgba(250, 246, 238, 0)');
    ctx.globalAlpha = 0.22;
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
        // Subtle isometric horizon walkway linking left/right wings
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.52;
        ctx.fillRect(width * 0.14, horizonY - 68, width * 0.14, 12);
        ctx.fillRect(width * 0.72, horizonY - 76, width * 0.15, 12);
        ctx.globalAlpha = 1;
        break;
      }
      case 'gorogoa': {
        // Layered rounded gallery niches & overlapping solar discs (shape-forward instead of box strokes)
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
        ctx.fillStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.09;
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.42, 168, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.42, 118, 0, Math.PI * 2);
        ctx.fill();
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
          // Soft sun dome atop ziggurat
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
        ctx.beginPath();
        ctx.arc(95, 160, 22, 0, Math.PI * 2);
        ctx.arc(width - 95, 160, 22, 0, Math.PI * 2);
        ctx.fill();
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
        const cx = width * 0.5;
        const cy = height * 0.48;
        ctx.fillStyle = palette.architectureLight;
        ctx.globalAlpha = 0.14;
        ctx.beginPath();
        ctx.arc(cx, cy, 240, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.blockA.highlight;
        ctx.globalAlpha = 0.16;
        this.drawDiamond(ctx, cx, cy, 270);
        ctx.fillStyle = palette.skyMid;
        ctx.globalAlpha = 0.24;
        this.drawDiamond(ctx, cx, cy, 180);
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
        // Sculptural domed & stepped Art Deco skyline towers with round porthole & arch windows (no rigid outlines)
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
          // Soft circular & pill arch windows
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
        // Concentric color-field target medallions framed on warm gallery bays
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
        // Curated mixed-media woodblock relief tiles flanking the stage
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
        // Oxidized jade colonnade aqueduct arches
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
        // Aegean terracotta domes & stepped courtyard terraces
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
        // Printmaker overlapping geometric halftones & Bauhaus half-moons
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
        // Warm beeswax canyon mesas & horizon ridges
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
        // Graceful vaulted celadon porcelain domes & side alcoves (filled soft arches, no wire lines)
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
        // Amber harbor towers & maritime masts
        const drawDockTower = (tx: number, w: number, h: number) => {
          ctx.fillStyle = palette.architectureMid;
          ctx.globalAlpha = 0.48;
          ctx.fillRect(tx, horizonY - h, w, h + 18);
          ctx.fillStyle = palette.blockA.fill;
          ctx.globalAlpha = 0.45;
          ctx.fillRect(tx + 8, horizonY - h + 14, w - 16, 16);
        };
        drawDockTower(width * 0.06, 68, 195);
        drawDockTower(width * 0.14, 52, 135);
        drawDockTower(width * 0.81, 56, 150);
        drawDockTower(width * 0.88, 70, 215);
        ctx.globalAlpha = 1;
        break;
      }
      case 'aurora_prism': {
        // Layered alpine dawn peaks & luminous prism shafts
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
    }
  }

  private drawNearLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    skin: SkinConfig
  ): void {
    const { palette } = skin;
    const horizonY = height * 0.76;

    ctx.save();
    // Subtle foreground corner isometric plinths that move fastest (1.05x) for tangible 3D framing
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

    // Soft filled shoreline mist band + elliptical reflection pebbles
    ctx.fillStyle = palette.architectureLight;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(-PARALLAX_OVERSCAN_X, horizonY - 2, width + PARALLAX_OVERSCAN_X * 2, 5);
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(width * 0.14, horizonY + 14, 72, 6, 0, 0, Math.PI * 2);
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

    ctx.fillStyle = palette.boardSurface;
    this.roundRect(ctx, x - 6, y - 6, width + 12, height + 12, 10);
    ctx.fill();

    ctx.strokeStyle =
      board.pendingGarbage > 0 ? palette.hudAccent : palette.boardFrame;
    ctx.lineWidth = board.pendingGarbage > 0 ? 2.6 : 2;
    this.roundRect(ctx, x - 6, y - 6, width + 12, height + 12, 10);
    ctx.stroke();

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

    // Subtle beat + sub-bass reactive grid vertices & soft hairlines
    const gridBeatPulse = Math.pow(1 - beatPhase, 2.8);
    ctx.save();
    ctx.strokeStyle = palette.gridLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.42 + gridBeatPulse * 0.14 + subBass * 0.12;
    for (let c = 1; c < boardCols; c++) {
      const gx = x + c * cellSize;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + height);
      ctx.stroke();
    }
    for (let r = 1; r < boardRows; r++) {
      const gy = y + r * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + width, gy);
      ctx.stroke();
    }
    ctx.fillStyle = palette.gridLine;
    ctx.globalAlpha = 0.55 + gridBeatPulse * 0.2;
    for (let r = 1; r < boardRows; r++) {
      const gy = y + r * cellSize;
      for (let c = 1; c < boardCols; c++) {
        ctx.fillRect(x + c * cellSize - 1, gy - 1, 2, 2);
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

    // Hard-drop impact light beams (supports downward, upward, and horizontal flows)
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

    // Subtle pulsing flow-direction entry chevrons when gravity is shifted away from downward
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

    // Portal edge ribbons when portal_wrap is active
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

    // Conveyor belt track chevrons along bottom row when conveyor_floor is active
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

    // Fluid waterline / ink-brushstroke wake trail behind timeline beam(s)
    const isRtlSweep = board.activeShift === 'reverse_sweep';
    const isTwinSweep = board.activeShift === 'twin_sweep';
    const isSplitHalfSweep = board.activeShift === 'split_half_sweep';
    const isDiagonalSlantSweep = board.activeShift === 'diagonal_slant_sweep';
    const tlX = isRtlSweep ? x + (1 - timelineNorm) * width : x + timelineNorm * width;
    const twinNorm = (timelineNorm + 0.5) % 1;
    const tl2X = x + twinNorm * width;
    const midSplitRow = Math.floor(boardRows / 2);
    const splitY = y + midSplitRow * cellSize;
    const slantCols = getDiagonalSlantSpan(boardCols);
    const slantNorm = slantCols / Math.max(1, boardCols);
    const slantBotNorm = ((timelineNorm - slantNorm) % 1 + 1) % 1;
    const activeSweepBonus = board.sweepState.squaresThisSweep > 0 ? 0.35 : 0;
    const glowW = cellSize * (3.15 + activeSweepBonus * 0.9 + subBass * 0.9);
    const drawSweepWakeBand = (
      beamX: number,
      rtl: boolean,
      topY: number,
      bandH: number
    ) => {
      const wakeStart = rtl ? beamX + glowW : beamX - glowW;
      const glowGrad = ctx.createLinearGradient(wakeStart, 0, beamX, 0);
      glowGrad.addColorStop(0, 'rgba(250, 246, 238, 0)');
      glowGrad.addColorStop(0.55, palette.timelineGlow);
      glowGrad.addColorStop(1, palette.timelineGlow);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(rtl ? beamX : beamX - glowW, topY, glowW, bandH);

      ctx.save();
      ctx.strokeStyle = palette.squareHighlight;
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

    if (isSplitHalfSweep) {
      drawSweepWakeBand(tlX, false, y, splitY - y);
      drawSweepWakeBand(tl2X, false, splitY, y + height - splitY);
      // Crisp horizontal split-plane indicator across board midline
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
    } else {
      drawSweepWakeBand(tlX, isRtlSweep, y, height);
      if (isTwinSweep) {
        drawSweepWakeBand(tl2X, false, y, height);
      }
    }

    // Precompute smooth visualX/visualY for active piece along gravityDirection
    const activePiece = board.activePiece && !board.isGameOver ? board.activePiece : null;
    const { gx: gVecX, gy: gVecY } = getGravityVector(gravDir);
    const subStepOffset =
      activePiece &&
      board.orientationGraceTimer <= 0 &&
      canPlacePiece(board, activePiece, gVecX, gVecY)
        ? Math.min(0.95, Math.max(0, board.gravityAccum))
        : 0;
    const visualPieceX = activePiece ? activePiece.x + gVecX * subStepOffset : 0;
    const visualPieceY = activePiece ? activePiece.y + gVecY * subStepOffset : 0;

    // Ghost landing preview & drop guide beam inside board
    if (activePiece) {
      this.drawGhostPiece(
        ctx,
        x,
        y,
        cellSize,
        board,
        activePiece,
        skin,
        visualPieceX,
        visualPieceY,
        beatPhase
      );
    }

    // Settled cells with ceramic/crystal distinction, landing rebound, and neighbor ripple
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
            beatPhase
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
        if (cell.isPeggle) {
          this.drawPeggleOrbCell(
            ctx,
            drawX,
            drawY,
            cellSize,
            cell.color,
            cell.isChain,
            skin,
            {
              inSquare: cell.inSquare && settledForMarks,
              chainMarked: cell.chainMarked,
              pendingClear: cell.pendingClear,
              sweptCol: cell.sweptCol,
              landFlash: cell.landFlash,
              rippleGlow: this.tmpRipple.glow,
              beatPhase,
              timeSec,
              shimmerWave:
                cell.inSquare && settledForMarks
                  ? 0.5 + 0.5 * Math.sin(timeSec * 3.6 - (r + c) * 0.58)
                  : 0,
            }
          );
          continue;
        }
        this.writeGridCellJoins(board.grid, r, c, cell, this.tmpJoins);
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
            ? 0.5 + 0.5 * Math.sin(timeSec * 3.6 - (r + c) * 0.58)
            : 0;
        this.tmpBlockFx.isWild = Boolean(cell.isWild);
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

    // Luminous bridge filaments connecting chainMarked clusters (including isWild links)
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

    // Unified Iluminado 2x2 Formed-Square Cluster Perimeter & Center Nexus Gems
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

    // Exterior luminous outline around connected settled inSquare clusters
    ctx.save();
    ctx.strokeStyle = palette.squareHighlight;
    ctx.lineWidth = Math.max(2, cellSize * 0.085);
    ctx.lineCap = 'square';
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        const cell = board.grid[r][c];
        if (!cell || !cell.inSquare || !isSettledCell(cell)) continue;
        const bx = x + c * cellSize;
        const by = y + r * cellSize;
        const sameSq = (nr: number, nc: number) =>
          nr >= 0 &&
          nr < boardRows &&
          nc >= 0 &&
          nc < boardCols &&
          isSettledCell(board.grid[nr][nc]) &&
          board.grid[nr][nc]?.inSquare &&
          board.grid[nr][nc]?.color === cell.color;
        if (!sameSq(r - 1, c)) {
          ctx.beginPath();
          ctx.moveTo(bx + 1, by + 1);
          ctx.lineTo(bx + cellSize - 1, by + 1);
          ctx.stroke();
        }
        if (!sameSq(r + 1, c)) {
          ctx.beginPath();
          ctx.moveTo(bx + 1, by + cellSize - 1);
          ctx.lineTo(bx + cellSize - 1, by + cellSize - 1);
          ctx.stroke();
        }
        if (!sameSq(r, c - 1)) {
          ctx.beginPath();
          ctx.moveTo(bx + 1, by + 1);
          ctx.lineTo(bx + 1, by + cellSize - 1);
          ctx.stroke();
        }
        if (!sameSq(r, c + 1)) {
          ctx.beginPath();
          ctx.moveTo(bx + cellSize - 1, by + 1);
          ctx.lineTo(bx + cellSize - 1, by + cellSize - 1);
          ctx.stroke();
        }
      }
    }
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
      } else if (fx.type === 'vortex_swirl' || fx.type === 'cyclotron_flow') {
        const cxB = x + width * 0.5;
        const cyB = y + height * 0.5;
        const rMax = Math.min(width, height) * 0.42;
        const spin = (1 - frac) * Math.PI * 1.4;
        ctx.strokeStyle = palette.hudAccent;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = frac * 0.72;
        for (let k = 0; k < 3; k++) {
          const arcR = rMax * (0.45 + k * 0.26);
          ctx.beginPath();
          ctx.arc(cxB, cyB, arcR, spin + k * 1.1, spin + k * 1.1 + Math.PI * 1.15);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.restore(); // end clip

    // Beat top rhythm diamonds, measure labels & bottom equalizer ticks
    const activeBeatCol = isRtlSweep
      ? Math.max(0, boardCols - 1 - (Math.floor(timelineNorm * boardCols) % boardCols))
      : Math.floor(timelineNorm * boardCols) % boardCols;
    const activeBeatCol2 = isTwinSweep
      ? Math.floor(twinNorm * boardCols) % boardCols
      : -1;
    const activeBeatColBot = isSplitHalfSweep
      ? Math.floor(twinNorm * boardCols) % boardCols
      : isDiagonalSlantSweep
      ? Math.floor(slantBotNorm * boardCols) % boardCols
      : activeBeatCol;
    const isSkyDark = isHexColorDark(palette.skyMid);
    const barStride = boardCols >= 16 ? 4 : 2;
    ctx.save();
    for (let c = 0; c < boardCols; c++) {
      const dx = x + (c + 0.5) * cellSize;
      const dy = y - 13;
      const isActiveColTop = c === activeBeatCol || c === activeBeatCol2;
      const isActiveColBot =
        c === activeBeatColBot || (isTwinSweep && c === activeBeatCol2);
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
        ctx.fillStyle = isCurrMeasure
          ? palette.hudAccent
          : isSkyDark
          ? '#faf7f2'
          : palette.hudInk;
        ctx.globalAlpha = isCurrMeasure ? 0.88 : 0.32;
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${measureNum}`, dx, y - 22);
      }

      // Subtle bottom rhythmic column tick that glows when column has formed marks
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
      ctx.fillStyle = colHasMarks || isActiveColBot ? palette.hudAccent : palette.timelineBeam;
      ctx.globalAlpha = colHasMarks
        ? 0.72 + colSpectrum * 0.24
        : isActiveColBot
        ? 0.85
        : 0.22 + colSpectrum * 0.44;
      ctx.fillRect(dx - cellSize * 0.22, y + height + 9, cellSize * 0.44, tickH);
    }
    ctx.restore();

    // Active falling / staging piece (supports all shapes, Peggle orb, and all 4 flow directions)
    if (activePiece) {
      const pieceRows = activePiece.cells.length;
      const pieceCols = activePiece.cells[0]?.length ?? 2;
      const lockProgress =
        board.lockTimer > 0 ? Math.min(1, board.lockTimer / LOCK_DELAY_SEC) : 0;

      // Subtle architectural staging terrace guide outside active entry edge
      if (gravDir === 'down' && visualPieceY < 0) {
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
        const leftRailX = x + visualPieceX * cellSize;
        const rightRailX = x + (visualPieceX + pieceCols) * cellSize;
        const topRailY = y + visualPieceY * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, topRailY);
        ctx.lineTo(leftRailX, y);
        ctx.moveTo(rightRailX, topRailY);
        ctx.lineTo(rightRailX, y);
        ctx.stroke();
        ctx.restore();
      } else if (gravDir === 'up' && visualPieceY + pieceRows > boardRows) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const leftRailX = x + visualPieceX * cellSize;
        const rightRailX = x + (visualPieceX + pieceCols) * cellSize;
        const botRailY = y + (visualPieceY + pieceRows) * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, y + height);
        ctx.lineTo(leftRailX, botRailY);
        ctx.moveTo(rightRailX, y + height);
        ctx.lineTo(rightRailX, botRailY);
        ctx.stroke();
        ctx.restore();
      } else if (gravDir === 'right' && visualPieceX < 0) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const topRailY = y + visualPieceY * cellSize;
        const botRailY = y + (visualPieceY + pieceRows) * cellSize;
        const leftRailX = x + visualPieceX * cellSize;
        ctx.beginPath();
        ctx.moveTo(leftRailX, topRailY);
        ctx.lineTo(x, topRailY);
        ctx.moveTo(leftRailX, botRailY);
        ctx.lineTo(x, botRailY);
        ctx.stroke();
        ctx.restore();
      } else if (gravDir === 'left' && visualPieceX + pieceCols > boardCols) {
        ctx.save();
        ctx.strokeStyle = palette.timelineBeam;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        const topRailY = y + visualPieceY * cellSize;
        const botRailY = y + (visualPieceY + pieceRows) * cellSize;
        const rightRailX = x + (visualPieceX + pieceCols) * cellSize;
        ctx.beginPath();
        ctx.moveTo(x + width, topRailY);
        ctx.lineTo(rightRailX, topRailY);
        ctx.moveTo(x + width, botRailY);
        ctx.lineTo(rightRailX, botRailY);
        ctx.stroke();
        ctx.restore();
      }

      // Draw luminous bounce wake trail behind falling Peggle orb
      if (activePiece.isPeggle && activePiece.peggleTrail && activePiece.peggleTrail.length > 0) {
        const trail = activePiece.peggleTrail;
        const pColor = activePiece.cells[0]?.[0]?.color ?? 0;
        const pStyle = getBlockStyle(palette, pColor);
        ctx.save();
        ctx.strokeStyle = pStyle.highlight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, cellSize * 0.14);
        ctx.globalAlpha = 0.38;
        ctx.beginPath();
        trail.forEach((pt, idx) => {
          const tx = x + (pt.x + 0.5) * cellSize;
          const ty = y + (pt.y + 0.5) * cellSize;
          if (idx === 0) ctx.moveTo(tx, ty);
          else ctx.lineTo(tx, ty);
        });
        ctx.lineTo(x + (visualPieceX + 0.5) * cellSize, y + (visualPieceY + 0.5) * cellSize);
        ctx.stroke();
        trail.forEach((pt, idx) => {
          const frac = (idx + 1) / (trail.length + 1);
          ctx.fillStyle = pStyle.highlight;
          ctx.globalAlpha = 0.16 + frac * 0.34;
          ctx.beginPath();
          ctx.arc(
            x + (pt.x + 0.5) * cellSize,
            y + (pt.y + 0.5) * cellSize,
            cellSize * (0.09 + frac * 0.09),
            0,
            Math.PI * 2
          );
          ctx.fill();
        });
        ctx.restore();
      }

      for (let py = 0; py < pieceRows; py++) {
        for (let px = 0; px < pieceCols; px++) {
          const pCell = activePiece.cells[py]?.[px];
          if (!pCell) continue;
          const cx = x + (visualPieceX + px) * cellSize;
          const cy = y + (visualPieceY + py) * cellSize;
          if (pCell.isBlocked) {
            this.drawBlockedObsidianTile(ctx, cx, cy, cellSize, lockProgress * 0.25);
            continue;
          }
          if (pCell.isPeggle || activePiece.isPeggle) {
            this.drawPeggleOrbCell(
              ctx,
              cx,
              cy,
              cellSize,
              pCell.color,
              pCell.isChain,
              skin,
              {
                inSquare: false,
                chainMarked: false,
                pendingClear: false,
                sweptCol: false,
                landFlash: lockProgress * 0.25,
                rippleGlow: 0,
                beatPhase,
                timeSec,
                shimmerWave: 0,
              }
            );
            continue;
          }
          this.writePieceCellJoins(activePiece, py, px, this.tmpJoins);
          this.tmpBlockFx.row = py;
          this.tmpBlockFx.col = Math.round(visualPieceX + px);
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

      // Crisp lock-delay bar along the leading grounded edge facing gravityDirection
      if (lockProgress > 0.04) {
        ctx.save();
        ctx.fillStyle = palette.hudAccent;
        ctx.globalAlpha = 0.82;
        if (gravDir === 'down') {
          const barW = cellSize * pieceCols * (1 - lockProgress);
          const barX = x + visualPieceX * cellSize + (cellSize * pieceCols - barW) * 0.5;
          const barY = y + (visualPieceY + pieceRows) * cellSize + 2;
          ctx.fillRect(barX, barY, barW, 2.5);
        } else if (gravDir === 'up') {
          const barW = cellSize * pieceCols * (1 - lockProgress);
          const barX = x + visualPieceX * cellSize + (cellSize * pieceCols - barW) * 0.5;
          const barY = y + visualPieceY * cellSize - 4.5;
          ctx.fillRect(barX, barY, barW, 2.5);
        } else if (gravDir === 'right') {
          const barH = cellSize * pieceRows * (1 - lockProgress);
          const barY = y + visualPieceY * cellSize + (cellSize * pieceRows - barH) * 0.5;
          const barX = x + (visualPieceX + pieceCols) * cellSize + 2;
          ctx.fillRect(barX, barY, 2.5, barH);
        } else {
          const barH = cellSize * pieceRows * (1 - lockProgress);
          const barY = y + visualPieceY * cellSize + (cellSize * pieceRows - barH) * 0.5;
          const barX = x + visualPieceX * cellSize - 4.5;
          ctx.fillRect(barX, barY, 2.5, barH);
        }
        ctx.restore();
      }
    }

    // Prominent Vertical / Modified Timeline Sweep Bar(s)
    const drawSweepCounterBadge = (beamX: number) => {
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
      ctx.fillStyle = palette.timelineBeam;
      this.roundRect(ctx, bx - 13, by - 10, 26, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#faf6ee';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx, by + 0.5);
    };

    const drawSweepSegment = (
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      ctx.strokeStyle = palette.timelineBeam;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = palette.squareHighlight;
      ctx.globalAlpha = 0.45 + beatPulse * 0.25;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawSweepBeam = (beamX: number, showCounterBadge: boolean) => {
      ctx.save();
      drawSweepSegment(beamX, y - 8, beamX, y + height + 8);
      ctx.fillStyle = palette.timelineBeam;
      this.drawDiamond(ctx, beamX, y - 9, 6 + beatPulse * 1.1);
      this.drawDiamond(ctx, beamX, y + height + 9, 6 + beatPulse * 1.1);
      if (showCounterBadge) drawSweepCounterBadge(beamX);
      ctx.restore();
    };

    if (isSplitHalfSweep) {
      ctx.save();
      // Upper half beam + top diamond + midline split junction node
      drawSweepSegment(tlX, y - 8, tlX, splitY);
      ctx.fillStyle = palette.timelineBeam;
      this.drawDiamond(ctx, tlX, y - 9, 6 + beatPulse * 1.1);
      this.drawDiamond(ctx, tlX, splitY, 4.6 + beatPulse * 0.8);

      // Lower half beam (phase-shifted 50%) + midline split junction node + bottom diamond
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
    } else {
      drawSweepBeam(tlX, true);
      if (isTwinSweep) {
        drawSweepBeam(tl2X, false);
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

      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = skin.palette.timelineBeam;
      ctx.lineWidth = 1.25;
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

    // Draw directional ghost cell outlines from landing.ghostCells without Set allocations
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

      if (gc.isPeggle) {
        const radius = cellSize * 0.42;
        ctx.fillStyle = style.fill;
        ctx.globalAlpha = 0.24 + beatPulse * 0.08;
        ctx.beginPath();
        ctx.arc(cx + cellSize * 0.5, cy + cellSize * 0.5, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = style.border;
        ctx.globalAlpha = 0.68 + beatPulse * 0.14;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      const joinTop = !gc.isWild && hasGhostAt(gc.x, gc.y - 1, gc.color);
      const joinBot = !gc.isWild && hasGhostAt(gc.x, gc.y + 1, gc.color);
      const joinLeft = !gc.isWild && hasGhostAt(gc.x - 1, gc.y, gc.color);
      const joinRight = !gc.isWild && hasGhostAt(gc.x + 1, gc.y, gc.color);

      ctx.fillStyle = gc.isWild ? skin.palette.squareHighlight : style.fill;
      ctx.globalAlpha = 0.22 + beatPulse * 0.06;
      ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);

      ctx.globalAlpha = 0.64 + beatPulse * 0.14;
      ctx.strokeStyle = gc.isWild ? skin.palette.hudAccent : style.border;
      ctx.lineWidth = 1.75;
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
    beatPhase: number
  ): void {
    const styleType = cell.obstacleStyle ?? 'stone';
    const { palette } = skin;
    const beatGlow = Math.pow(1 - beatPhase, 3);
    const pad = 0.5;
    const bx = x + pad;
    const by = y + pad;
    const bw = Math.max(2, size - pad * 2);
    const bh = Math.max(2, size - pad * 2);

    ctx.save();
    if (styleType === 'blocked') {
      this.drawBlockedObsidianTile(ctx, x, y, size, cell.landFlash);
    } else if (styleType === 'chasm') {
      ctx.fillStyle = '#181422';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.5, by + 2);
      ctx.lineTo(bx + bw * 0.38, by + bh * 0.5);
      ctx.lineTo(bx + bw * 0.62, by + bh - 2);
      ctx.stroke();
      ctx.strokeStyle = palette.boardFrame;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    } else if (styleType === 'girder') {
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, '#5a556a');
      grad.addColorStop(0.5, '#3b3648');
      grad.addColorStop(1, '#292534');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw, bh);
      // Top & bottom girder flanges
      ctx.fillStyle = '#8b839d';
      ctx.fillRect(bx, by, bw, Math.max(2, size * 0.16));
      ctx.fillStyle = '#201c2c';
      ctx.fillRect(bx, by + bh - Math.max(2, size * 0.16), bw, Math.max(2, size * 0.16));
      // Diagonal truss cross-brace
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.25)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + 2, by + bh * 0.25);
      ctx.lineTo(bx + bw - 2, by + bh * 0.75);
      ctx.moveTo(bx + bw - 2, by + bh * 0.25);
      ctx.lineTo(bx + 2, by + bh * 0.75);
      ctx.stroke();
      // Corner rivets
      ctx.fillStyle = palette.hudAccent;
      const r = Math.max(1.2, size * 0.065);
      ctx.fillRect(bx + 3, by + 3, r, r);
      ctx.fillRect(bx + bw - 3 - r, by + 3, r, r);
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
      // Patrol chevron arrow hint
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
      // Coiled trampoline pad with amber bounce plate
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
      // Brittle crystal ledge with HP fracture lines when cracked (hp <= 1)
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
      // 'stone' or 'sawtooth': carved matte dark-granite neutral masonry block
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

      // Subtle diagonal architectural hatch so neutral blocks look carved and non-clearable
      ctx.strokeStyle = 'rgba(250, 246, 238, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.22, by + bh * 0.78);
      ctx.lineTo(bx + bw * 0.78, by + bh * 0.22);
      ctx.stroke();

      ctx.strokeStyle = '#1f1b29';
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

    // Carved obsidian rim bevel
    ctx.strokeStyle = '#554b6e';
    ctx.lineWidth = Math.max(1.1, size * 0.045);
    this.roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
    ctx.stroke();

    // Inner hairline recessed frame
    const inset = Math.max(2.5, size * 0.13);
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.14)';
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

    // Crisp etched cross seal mark
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
    }
  ): void {
    const style: BlockStyle = getBlockStyle(skin.palette, color);

    // Soft landing compression -> tiny upward rebound overshoot anchored to bottom edge
    let squashOffset = 0;
    if (fx.landFlash > 0.22) {
      const p = (fx.landFlash - 0.22) / 0.78;
      squashOffset = Math.sin(p * Math.PI * 1.45) * 1.85;
    }

    // Subtle multi-second ambient breathing per block
    const breathPhase = fx.timeSec * 1.15 + fx.row * 0.55 + fx.col * 0.35;
    const breath = 0.5 + 0.5 * Math.sin(breathPhase);

    // Gentle dissolve curve when queued for clearing on the timeline sweep (no jarring strobe)
    const dissolveWave = fx.pendingClear
      ? 0.5 + 0.5 * Math.sin(fx.timeSec * 5.2 - fx.col * 0.6)
      : 0;
    const dissolveScale = fx.pendingClear ? 0.92 - dissolveWave * 0.06 : 1;

    // Seamless auto-tiling across joined same-color neighbors
    const insetShrink = fx.pendingClear ? size * (1 - dissolveScale) * 0.5 : 0;
    const left = x + insetShrink;
    const right = (joins.right && !fx.pendingClear ? x + size + 0.5 : x + size) - insetShrink;
    const top = y + squashOffset + insetShrink;
    const bottom = (joins.bottom && !fx.pendingClear ? y + size + 0.5 : y + size) - insetShrink;
    const bw = Math.max(2, right - left);
    const bh = Math.max(2, bottom - top);

    const baseR = fx.isWild
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

    ctx.save();
    const baseAlpha = fx.pendingClear ? 0.72 + dissolveWave * 0.22 : 1;
    ctx.globalAlpha = baseAlpha;

    // Main block body path
    this.selectiveRoundRect(ctx, left, top, bw, bh, rTL, rTR, rBR, rBL);
    if (fx.isWild) {
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

    // Per-skin fill variant layering while keeping Color 0 (rounded ceramic) vs Color 1 (cut slate) crisp
    const fillVar = style.fillVariant;
    if (fillVar === 'concentric') {
      const cxT = left + bw * 0.5;
      const cyT = top + bh * 0.5;
      const maxRingR = Math.min(bw, bh) * 0.42;
      ctx.strokeStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (0.28 + breath * 0.06);
      ctx.lineWidth = Math.max(2, size * 0.11);
      ctx.beginPath();
      ctx.arc(cxT, cyT, maxRingR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = style.emblemColor;
      ctx.globalAlpha = baseAlpha * 0.24;
      ctx.lineWidth = Math.max(1.2, size * 0.055);
      ctx.beginPath();
      ctx.arc(cxT, cyT, maxRingR * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    } else if (fillVar === 'split_plane') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (0.16 + breath * 0.05);
      ctx.beginPath();
      ctx.moveTo(left + 1.5, top + 1.5);
      ctx.lineTo(right - 1.5, top + 1.5);
      ctx.lineTo(left + 1.5, bottom - 1.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = style.shade;
      ctx.globalAlpha = baseAlpha * 0.14;
      ctx.beginPath();
      ctx.moveTo(right - 1.5, bottom - 1.5);
      ctx.lineTo(right - 1.5, top + 1.5);
      ctx.lineTo(left + 1.5, bottom - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
    } else if (fillVar === 'wash') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (0.18 + breath * 0.07);
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.34, top + bh * 0.34, bw * 0.34, bh * 0.24, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = baseAlpha * 0.12;
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.7, top + bh * 0.72, bw * 0.26, bh * 0.2, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
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
      ctx.globalAlpha = baseAlpha * (0.28 + breath * 0.08);
      ctx.fillRect(left + 1, top + 1, Math.max(1, bw - 2), Math.max(1, bh - 2));
      ctx.globalAlpha = baseAlpha;
    } else if (fillVar === 'satin') {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (0.15 + breath * 0.06);
      ctx.beginPath();
      ctx.ellipse(left + bw * 0.36, top + bh * 0.3, bw * 0.26, bh * 0.16, -0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
    } else {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * 0.07;
      ctx.fillRect(left + 1.5, top + 1.5, Math.max(1, bw - 3), Math.max(1, (bh - 3) * 0.45));
      ctx.globalAlpha = baseAlpha;
    }

    // Formed 2x2 square living pearl wash & deepening anticipation
    if (fx.inSquare) {
      ctx.fillStyle = skin.palette.squareHighlight;
      ctx.globalAlpha = baseAlpha * (0.18 + fx.shimmerWave * 0.16);
      ctx.fillRect(left + 1, top + 1, Math.max(1, bw - 2), Math.max(1, bh - 2));
      ctx.globalAlpha = baseAlpha;
    }

    // World material micro-texture overlay
    const texPad = Math.max(2, Math.floor(size * 0.08));
    this.drawBlockTexture(
      ctx,
      left + texPad,
      top + texPad,
      Math.max(1, bw - texPad * 2),
      Math.max(1, bh - texPad * 2),
      style,
      fx.row * 7 + fx.col * 13
    );

    // Directional exposed-edge bevel highlights (top & left) and shade (bottom & right)
    const bevel = Math.max(1.5, Math.floor(size * 0.085));
    if (!joins.top) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * (color === 0 ? 0.56 : 0.68);
      ctx.fillRect(left + (rTL > 0 ? 2 : 0), top, bw - (rTL > 0 ? 2 : 0) - (rTR > 0 ? 2 : 0), bevel);
    }
    if (!joins.left) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * 0.44;
      ctx.fillRect(left, top + (rTL > 0 ? 2 : 0), bevel, bh - (rTL > 0 ? 2 : 0) - (rBL > 0 ? 2 : 0));
    }
    if (!joins.bottom) {
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = baseAlpha * (color === 0 ? 0.58 : 0.7);
      ctx.fillRect(left + (rBL > 0 ? 2 : 0), bottom - bevel, bw - (rBL > 0 ? 2 : 0) - (rBR > 0 ? 2 : 0), bevel);
    }
    if (!joins.right) {
      ctx.fillStyle = style.shade;
      ctx.globalAlpha = baseAlpha * 0.44;
      ctx.fillRect(right - bevel, top + (rTR > 0 ? 2 : 0), bevel, bh - (rTR > 0 ? 2 : 0) - (rBR > 0 ? 2 : 0));
    }
    ctx.globalAlpha = baseAlpha;

    // Soft shared light seam between matching joined neighbors so connection reads tactilely
    ctx.strokeStyle =
      color === 0 ? 'rgba(250, 246, 238, 0.22)' : 'rgba(250, 246, 238, 0.14)';
    ctx.lineWidth = 1;
    if (joins.top) {
      ctx.beginPath();
      ctx.moveTo(left + 3, top);
      ctx.lineTo(x + size - 3, top);
      ctx.stroke();
    }
    if (joins.left) {
      ctx.beginPath();
      ctx.moveTo(left, top + 3);
      ctx.lineTo(left, y + size - 3);
      ctx.stroke();
    }

    // Per-skin stroke variant on exposed edges (cleanly differentiates finishes)
    const strokeVar = style.strokeVariant;
    const inset = 0.6;
    if (strokeVar === 'offset_ink') {
      ctx.strokeStyle = style.border;
      ctx.globalAlpha = baseAlpha * 0.34;
      ctx.lineWidth = 1.2;
      if (!joins.bottom) {
        ctx.beginPath();
        ctx.moveTo(left + 1.5, y + size - inset + 0.9);
        ctx.lineTo(x + size - 0.5, y + size - inset + 0.9);
        ctx.stroke();
      }
      if (!joins.right) {
        ctx.beginPath();
        ctx.moveTo(x + size - inset + 0.9, top + 1.5);
        ctx.lineTo(x + size - inset + 0.9, y + size - 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = baseAlpha;
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
      ctx.lineTo(x + size - rTR, top + inset);
      ctx.stroke();
    }
    if (!joins.bottom) {
      ctx.beginPath();
      ctx.moveTo(left + rBL, y + size - inset);
      ctx.lineTo(x + size - rBR, y + size - inset);
      ctx.stroke();
    }
    if (!joins.left) {
      ctx.beginPath();
      ctx.moveTo(left + inset, top + rTL);
      ctx.lineTo(left + inset, y + size - rBL);
      ctx.stroke();
    }
    if (!joins.right) {
      ctx.beginPath();
      ctx.moveTo(x + size - inset, top + rTR);
      ctx.lineTo(x + size - inset, y + size - rBR);
      ctx.stroke();
    }

    if (strokeVar === 'painterly') {
      ctx.strokeStyle = style.border;
      ctx.globalAlpha = baseAlpha * 0.42;
      ctx.lineWidth = 1.1;
      if (!joins.top) {
        ctx.beginPath();
        ctx.moveTo(left + rTL + 2, top + 1.9);
        ctx.lineTo(x + size - rTR - 2, top + 1.4);
        ctx.stroke();
      }
      if (!joins.left) {
        ctx.beginPath();
        ctx.moveTo(left + 1.9, top + rTL + 2);
        ctx.lineTo(left + 1.4, y + size - rBL - 2);
        ctx.stroke();
      }
      ctx.globalAlpha = baseAlpha;
    } else if (strokeVar === 'double') {
      const innerPad = Math.max(2.6, Math.floor(size * 0.11));
      if (bw > innerPad * 2 + 4 && bh > innerPad * 2 + 4) {
        ctx.strokeStyle = style.emblemColor;
        ctx.globalAlpha = baseAlpha * 0.34;
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
        ctx.globalAlpha = baseAlpha;
      }
    } else if (strokeVar === 'recessed') {
      ctx.strokeStyle = style.shade;
      ctx.globalAlpha = baseAlpha * 0.38;
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
      ctx.globalAlpha = baseAlpha;
    } else if (strokeVar === 'corner_ticks') {
      const tick = Math.max(3, Math.floor(size * 0.16));
      const pad = 2.6;
      ctx.strokeStyle = style.emblemColor;
      ctx.globalAlpha = baseAlpha * 0.48;
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

    // Keep tiles clean: draw center glyph ONLY for Chain enhancement blocks
    const useDarkChainGlyph =
      getHexLuminance(style.fill) > 0.78 &&
      getHexLuminance(style.emblemColor) < 0.45;
    if (isChain) {
      const cx = left + bw * 0.5;
      const cy = top + bh * 0.5;
      const pulse = 1 + 0.12 * Math.sin(fx.timeSec * 6.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      const arm = size * 0.28;
      const thick = size * 0.1;
      ctx.fillStyle = useDarkChainGlyph ? style.emblemColor : '#faf6ee';
      ctx.fillRect(-arm, -thick / 2, arm * 2, thick);
      ctx.fillRect(-thick / 2, -arm, thick, arm * 2);
      ctx.strokeStyle = useDarkChainGlyph ? style.highlight : style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(-arm, -thick / 2, arm * 2, thick);
      ctx.restore();
    }

    if (fx.chainMarked) {
      ctx.strokeStyle = useDarkChainGlyph ? style.emblemColor : '#faf6ee';
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 2, top + 2, bw - 4, bh - 4);
    }

    if (fx.sweptCol) {
      ctx.fillStyle = skin.palette.squareHighlight;
      ctx.globalAlpha = baseAlpha * 0.24;
      ctx.fillRect(left, top, bw, bh);
    }

    // Subtle soft illumination from landing flash + passing neighbor ripple
    const totalWash = Math.min(0.42, fx.landFlash * 0.34 + fx.rippleGlow);
    if (totalWash > 0.01) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * totalWash;
      ctx.fillRect(left, top, bw, bh);
    }

    ctx.restore();
  }

  private drawPeggleOrbCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: CellColor,
    isChain: boolean,
    skin: SkinConfig,
    fx: {
      inSquare: boolean;
      chainMarked: boolean;
      pendingClear: boolean;
      sweptCol: boolean;
      landFlash: number;
      rippleGlow: number;
      beatPhase: number;
      timeSec: number;
      shimmerWave: number;
    }
  ): void {
    const style = getBlockStyle(skin.palette, color);
    const dissolveWave = fx.pendingClear
      ? 0.5 + 0.5 * Math.sin(fx.timeSec * 5.2)
      : 0;
    const scale = fx.pendingClear ? 0.9 - dissolveWave * 0.08 : 1;
    const baseAlpha = fx.pendingClear ? 0.72 + dissolveWave * 0.22 : 1;
    const cx = x + size * 0.5;
    const cy = y + size * 0.5;
    const r = Math.max(2, size * 0.44 * scale);

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    // Soft sphere radial body gradient
    const orbGrad = ctx.createRadialGradient(
      cx - r * 0.32,
      cy - r * 0.32,
      r * 0.1,
      cx,
      cy,
      r
    );
    orbGrad.addColorStop(0, style.highlight);
    orbGrad.addColorStop(0.55, style.fill);
    orbGrad.addColorStop(1, style.fillGradientEnd);
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Subtle lower rim shade & square glow wash
    if (fx.inSquare) {
      ctx.fillStyle = skin.palette.squareHighlight;
      ctx.globalAlpha = baseAlpha * (0.24 + fx.shimmerWave * 0.18);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
    }

    // Glossy specular pearl highlight
    ctx.fillStyle = '#faf6ee';
    ctx.globalAlpha = baseAlpha * 0.72;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.34, cy - r * 0.34, r * 0.24, r * 0.14, -0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = baseAlpha;
    ctx.strokeStyle = style.border;
    ctx.lineWidth = Math.max(1.3, size * 0.055);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (isChain) {
      const useDark =
        getHexLuminance(style.fill) > 0.78 &&
        getHexLuminance(style.emblemColor) < 0.45;
      const arm = r * 0.55;
      const thick = Math.max(2, r * 0.22);
      ctx.fillStyle = useDark ? style.emblemColor : '#faf6ee';
      ctx.fillRect(cx - arm, cy - thick * 0.5, arm * 2, thick);
      ctx.fillRect(cx - thick * 0.5, cy - arm, thick, arm * 2);
    }

    if (fx.chainMarked || fx.sweptCol) {
      ctx.strokeStyle = skin.palette.squareHighlight;
      ctx.lineWidth = 2;
      ctx.globalAlpha = baseAlpha * 0.75;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }

    const wash = Math.min(0.45, fx.landFlash * 0.36 + fx.rippleGlow);
    if (wash > 0.01) {
      ctx.fillStyle = style.highlight;
      ctx.globalAlpha = baseAlpha * wash;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
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
        ctx.strokeStyle = style.highlight;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.8, w * 0.52, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
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
      const alpha = t < 0.16 ? t / 0.16 : 1 - (t - 0.16) / 0.84;
      const popScale = t < 0.14 ? 0.85 + (t / 0.14) * 0.25 : 1 + Math.max(0, 0.28 - t) * 0.28;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(pop.x, pop.y);
      ctx.scale(popScale, popScale);
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255, 252, 248, 0.88)';
      ctx.fillStyle = pop.color;
      ctx.font = '700 22px "Fraunces", Georgia, serif';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillText(pop.text, 0, 0);
      if (pop.subtext) {
        ctx.font = '700 11.5px "Plus Jakarta Sans", sans-serif';
        ctx.lineWidth = 2.4;
        ctx.strokeText(pop.subtext, 0, 22);
        ctx.fillText(pop.subtext, 0, 22);
      }
      ctx.restore();
    }
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
