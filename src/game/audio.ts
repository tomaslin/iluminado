import { BoardState, MusicStyleId, SkinConfig } from './types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const MAX_DECODED_BUFFER_CACHE = 3;
export const MAX_RAW_TRACK_CACHE = 5;

export interface StemLevels {
  percussion: number;
  bass: number;
  lead: number;
  vocal: number;
}

/**
 * Computes dynamic 4-stem mix levels based on live board occupancy, formed squares,
 * combo state, and stage progression so tracks evolve organically as the player plays.
 */
export function computeStemLevels(
  board: BoardState | null,
  skin: SkinConfig
): StemLevels {
  if (!board) {
    return { percussion: 0.78, bass: 0.45, lead: 0.25, vocal: 0.1 };
  }

  let occupied = 0;
  for (let r = 0; r < board.grid.length; r++) {
    for (let c = 0; c < board.grid[r].length; c++) {
      const cell = board.grid[r][c];
      if (cell !== null && !cell.isObstacle) occupied++;
    }
  }

  const stageRatio = clamp(
    board.stageSquaresCleared / Math.max(1, skin.squaresToAdvance),
    0,
    1
  );
  const formedCount = board.squares.length;
  const sweepCount = board.sweepState.squaresThisSweep;

  const percussion = clamp(
    0.75 + Math.min(1, occupied / 36) * 0.18 + (sweepCount > 0 ? 0.07 : 0),
    0.75,
    1
  );

  const bass = clamp(
    0.36 +
      Math.min(1, occupied / 20) * 0.36 +
      (board.stageSquaresCleared >= 1 || formedCount > 0 ? 0.28 : 0),
    0.36,
    1
  );

  const lead = clamp(
    0.14 + (formedCount > 0 ? 0.42 : 0) + stageRatio * 0.44,
    0.14,
    1
  );

  const vocal = clamp(
    0.06 +
      (board.comboLevel > 0 ? 0.52 : 0) +
      Math.min(1, sweepCount / 3) * 0.32 +
      Math.max(0, stageRatio - 0.5) * 0.45,
    0.06,
    1
  );

  return { percussion, bass, lead, vocal };
}

export interface LoopTimingSpec {
  firstBeatSec: number;
  loopEndSec: number;
  loopSweeps: number;
}

/**
 * Resolves exact whole-sweep loop boundaries (`[firstBeatSec, loopEndSec)`) for a track buffer.
 */
export function resolveLoopTiming(
  skin: Pick<SkinConfig, 'bpm' | 'music'>,
  bufferDurationSec: number
): LoopTimingSpec {
  const bpm = Math.max(40, skin.bpm || 120);
  const sweepSec = (8 * 60) / bpm;
  const rawFirst = Math.max(0, skin.music.firstBeatSec ?? 0);
  const safeDur = Math.max(0, bufferDurationSec);

  if (safeDur <= 0.5) {
    return { firstBeatSec: 0, loopEndSec: safeDur, loopSweeps: 1 };
  }

  const firstBeatSec = Math.min(rawFirst, Math.max(0, safeDur - Math.min(sweepSec, safeDur * 0.5)));
  const configuredEnd = skin.music.loopEndSec;
  if (
    typeof configuredEnd === 'number' &&
    configuredEnd > firstBeatSec + sweepSec * 0.9 &&
    configuredEnd <= safeDur + 0.02
  ) {
    const clampedEnd = Math.min(safeDur, configuredEnd);
    const sweeps = Math.max(1, Math.round((clampedEnd - firstBeatSec) / sweepSec));
    const exactEnd = Math.min(safeDur, firstBeatSec + sweeps * sweepSec);
    return { firstBeatSec, loopEndSec: exactEnd, loopSweeps: sweeps };
  }

  const sweeps = Math.max(1, Math.floor((safeDur - firstBeatSec + 0.02) / sweepSec));
  const loopEndSec = Math.min(safeDur, firstBeatSec + sweeps * sweepSec);
  return { firstBeatSec, loopEndSec, loopSweeps: sweeps };
}

/**
 * Computes continuous unwrapped beat position directly from the unwrapped buffer playback cursor.
 * Because loop length is an exact whole number of 8-beat sweeps, `(beat % 8)` stays seamlessly
 * locked across every loop wrap.
 */
export function computeBeatFromBufferPosition(params: {
  rawUnwrappedPosSec: number;
  firstBeatSec: number;
  bpm: number;
}): number {
  const { rawUnwrappedPosSec, firstBeatSec, bpm } = params;
  const elapsedSec = Math.max(0, rawUnwrappedPosSec - firstBeatSec);
  return (elapsedSec * Math.max(40, bpm)) / 60;
}

/**
 * Quantizes rhythmic SFX (land, square-formed) to the next 16th-note boundary when within `maxSnapSec`,
 * returning delay in seconds (`0` if already on-grid or further than `maxSnapSec` away).
 */
export function computeQuantizedSfxDelaySec(
  beatPos: number,
  bpm: number,
  maxSnapSec = 0.06
): number {
  if (!Number.isFinite(beatPos) || !Number.isFinite(bpm) || bpm <= 0) return 0;
  const rawMod = (beatPos * 4) % 1;
  const frac16 = rawMod < 0 ? rawMod + 1 : rawMod;
  if (frac16 < 1e-4 || 1 - frac16 < 1e-4) return 0;
  const distBeats = (1 - frac16) / 4;
  const delaySec = distBeats * (60 / bpm);
  return delaySec <= maxSnapSec ? delaySec : 0;
}

export interface AudioSpectrumSnapshot {
  subBass: number;
  mid: number;
  high: number;
  bands: number[];
  hasLiveAudio: boolean;
}

const TRACK_TRIM_GAINS: Record<string, number> = {
  'music/world1.mp3': 1.38,
  'music/world2.mp3': 1.32,
  'music/world3.mp3': 2.5,
  'music/world4.mp3': 1.58,
  'music/world5.mp3': 0.8,
  'music/world6.mp3': 1.42,
  'music/world7.mp3': 0.68,
  'music/world8.mp3': 0.68,
  'music/world9.mp3': 0.65,
  'music/world10.mp3': 1.62,
  'music/world11.mp3': 0.94,
  'music/world12.mp3': 0.74,
  'music/world13.mp3': 0.66,
  'music/world14.mp3': 0.6,
  'music/world15.mp3': 0.6,
  'music/world16.mp3': 0.6,
  'music/world17.mp3': 0.68,
  'music/world18.mp3': 0.63,
  'music/world19.mp3': 0.62,
  'music/world20.mp3': 0.68,
  'music/world21.mp3': 0.98,
  'music/world22.mp3': 1.04,
  'music/world23.mp3': 0.74,
  'music/world24.mp3': 1.2,
  'music/world25.mp3': 0.86,
  'music/world26.mp3': 0.76,
  'music/world27.mp3': 1.12,
  'music/world28.mp3': 1.16,
  'music/world29.mp3': 0.96,
  'music/world30.mp3': 0.88,
  'music/world31.mp3': 0.94,
  'music/world32.mp3': 1.0,
  'music/world33.mp3': 0.92,
  'music/world34.mp3': 0.95,
  'music/world35.mp3': 0.88,
  'music/world36.mp3': 0.92,
  'music/world37.mp3': 0.84,
  'music/world38.mp3': 0.86,
  'music/world39.mp3': 0.94,
  'music/world40.mp3': 0.88,
  'music/world41.mp3': 1.58,
  'music/world42.mp3': 1.48,
  'music/world43.mp3': 1.12,
  'music/world44.mp3': 0.82,
  'music/world45.mp3': 0.92,
  'music/world46.mp3': 1.52,
  'music/world47.mp3': 0.82,
  'music/world48.mp3': 0.76,
  'music/world49.mp3': 1.18,
  'music/world50.mp3': 0.88,
};

export function getTrackTrimGain(trackUrl?: string | null): number {
  if (!trackUrl) return 1;
  const normalized = trackUrl.replace(/^\.?\//, '');
  return TRACK_TRIM_GAINS[normalized] ?? TRACK_TRIM_GAINS[trackUrl] ?? 1;
}

export class IluminadoAudioEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private spectrumBins: Uint8Array<ArrayBuffer> | null = null;
  private sfxBusGain: GainNode | null = null;
  private stemPercGain: GainNode | null = null;
  private stemBassGain: GainNode | null = null;
  private stemLeadGain: GainNode | null = null;
  private stemVocalGain: GainNode | null = null;

  // 3-band Linkwitz-Riley crossover split + mastering filter for MP3 tracks
  private musicTrimGain: GainNode | null = null;
  private musicLowBandGain: GainNode | null = null;
  private musicMidBandGain: GainNode | null = null;
  private musicHighBandGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicBusGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private distortionCache = new Map<number, WaveShaperNode['curve']>();

  private musicAudio: HTMLAudioElement | null = null;
  private activeMusicUrl: string | null = null;
  private desiredTrackUrl: string | null = null;
  private desiredSkin: SkinConfig | null = null;
  private desiredMode: 'title' | 'playing' | 'paused' | 'gameover' = 'title';
  private audioFadeTimers = new WeakMap<HTMLAudioElement, number>();
  private mediaSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private elementGains = new WeakMap<HTMLAudioElement, GainNode>();
  private elementVolumes = new WeakMap<HTMLAudioElement, number>();
  private attachedSourceEls = new WeakSet<HTMLAudioElement>();
  private fadingOutEls = new Set<HTMLAudioElement>();

  // Decoded AudioBuffer cache (capped at 3) + gapless sample-accurate AudioBufferSourceNode playback
  private rawTrackCache = new Map<string, ArrayBuffer>();
  private rawFetchPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private audioBuffers = new Map<string, AudioBuffer>();
  private decodePromises = new Map<string, Promise<AudioBuffer | null>>();
  private activeBufferNode: AudioBufferSourceNode | null = null;
  private activeBufferGain: GainNode | null = null;
  private activeBufferUrl: string | null = null;
  private activeBufferFadeEndCtxTime = 0;
  private transitionBloomUntilCtxTime = 0;
  private fadingBufferNodes = new Set<{ node: AudioBufferSourceNode; gain: GainNode }>();

  // Exact buffer playback clock tracking (handles dynamic playbackRate changes without phase slip)
  private currentTempoScale = 1;
  private bufferAnchorCtxTime = 0;
  private bufferAnchorRawPosSec = 0;
  private activeLoopTiming: LoopTimingSpec = { firstBeatSec: 0, loopEndSec: 0, loopSweeps: 1 };
  private activeBufferBpm = 120;
  private lastClockCtxTime: number | null = null;

  private unlockedByUser = false;
  private muted = false;
  private musicVolume = 0.85;
  private sfxVolume = 0.85;
  private hapticsEnabled = true;
  private iosHapticLabel: HTMLLabelElement | null = null;
  private lastIosHapticMs = 0;

  private lastStepTriggered = -1;
  private barIndex = 0;
  private rotateCursor = 0;
  private lastMoveSfxMs = 0;
  private moveLadderStep = 0;
  private shiftRiserProgress = 0;

  private lastStems: StemLevels = { percussion: 0.78, bass: 0.45, lead: 0.25, vocal: 0.1 };
  private lastComboLevel = 0;

  public unlock(): void {
    this.unlockedByUser = true;
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -15;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.18;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.76;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.76;
      this.spectrumBins = new Uint8Array(
        new ArrayBuffer(this.analyser.frequencyBinCount)
      );

      this.sfxBusGain = this.ctx.createGain();
      this.sfxBusGain.gain.value = 0.72 * this.sfxVolume;

      this.stemPercGain = this.ctx.createGain();
      this.stemBassGain = this.ctx.createGain();
      this.stemLeadGain = this.ctx.createGain();
      this.stemVocalGain = this.ctx.createGain();

      this.stemPercGain.gain.value = 0.85;
      this.stemBassGain.gain.value = 0.75;
      this.stemLeadGain.gain.value = 0.6;
      this.stemVocalGain.gain.value = 0.4;

      this.stemPercGain.connect(this.sfxBusGain);
      this.stemBassGain.connect(this.sfxBusGain);
      this.stemLeadGain.connect(this.sfxBusGain);
      this.stemVocalGain.connect(this.sfxBusGain);
      this.sfxBusGain.connect(this.compressor);

      // Studio MP3 multiband crossover split (LR4: Bass <200Hz, Mid 200..2400Hz, High >2400Hz)
      this.musicTrimGain = this.ctx.createGain();
      this.musicTrimGain.gain.value = getTrackTrimGain(this.activeMusicUrl);

      const lowLp1 = this.ctx.createBiquadFilter();
      lowLp1.type = 'lowpass';
      lowLp1.frequency.value = 200;
      lowLp1.Q.value = 0.7071;
      const lowLp2 = this.ctx.createBiquadFilter();
      lowLp2.type = 'lowpass';
      lowLp2.frequency.value = 200;
      lowLp2.Q.value = 0.7071;
      this.musicLowBandGain = this.ctx.createGain();
      this.musicLowBandGain.gain.value = 1;

      const midHp1 = this.ctx.createBiquadFilter();
      midHp1.type = 'highpass';
      midHp1.frequency.value = 200;
      midHp1.Q.value = 0.7071;
      const midHp2 = this.ctx.createBiquadFilter();
      midHp2.type = 'highpass';
      midHp2.frequency.value = 200;
      midHp2.Q.value = 0.7071;
      const midLp1 = this.ctx.createBiquadFilter();
      midLp1.type = 'lowpass';
      midLp1.frequency.value = 2400;
      midLp1.Q.value = 0.7071;
      const midLp2 = this.ctx.createBiquadFilter();
      midLp2.type = 'lowpass';
      midLp2.frequency.value = 2400;
      midLp2.Q.value = 0.7071;
      this.musicMidBandGain = this.ctx.createGain();
      this.musicMidBandGain.gain.value = 1;

      const highHp1 = this.ctx.createBiquadFilter();
      highHp1.type = 'highpass';
      highHp1.frequency.value = 2400;
      highHp1.Q.value = 0.7071;
      const highHp2 = this.ctx.createBiquadFilter();
      highHp2.type = 'highpass';
      highHp2.frequency.value = 2400;
      highHp2.Q.value = 0.7071;
      this.musicHighBandGain = this.ctx.createGain();
      this.musicHighBandGain.gain.value = 1;

      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 8200;
      this.musicFilter.Q.value = 0.72;

      this.musicBusGain = this.ctx.createGain();
      this.musicBusGain.gain.value = 0.56 * this.musicVolume;

      this.musicTrimGain.connect(lowLp1);
      lowLp1.connect(lowLp2);
      lowLp2.connect(this.musicLowBandGain);
      this.musicLowBandGain.connect(this.musicFilter);

      this.musicTrimGain.connect(midHp1);
      midHp1.connect(midHp2);
      midHp2.connect(midLp1);
      midLp1.connect(midLp2);
      midLp2.connect(this.musicMidBandGain);
      this.musicMidBandGain.connect(this.musicFilter);

      this.musicTrimGain.connect(highHp1);
      highHp1.connect(highHp2);
      highHp2.connect(this.musicHighBandGain);
      this.musicHighBandGain.connect(this.musicFilter);

      this.musicFilter.connect(this.musicBusGain);
      this.musicBusGain.connect(this.compressor);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Shared white-noise buffer (0.3s) for hi-hats, claps, snares, brushes, guira
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      if (this.musicAudio) {
        const preservedVol = this.musicAudio.paused ? 0.02 : 1;
        this.attachAudioElementToGraph(this.musicAudio, preservedVol);
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.desiredTrackUrl) {
      void this.ensureBufferDecoded(this.desiredTrackUrl);
    }
    this.ensureDesiredMusicPlaying();
    this.applyDynamicMusicShaping();
  }

  public isAudioUnlocked(): boolean {
    return this.unlockedByUser;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.76,
        this.ctx.currentTime,
        0.03
      );
    }
    if (this.musicAudio) {
      this.musicAudio.muted = muted;
    }
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = clamp(volume, 0, 1);
    this.applyDynamicMusicShaping();
    if (this.musicAudio && (!this.ctx || !this.attachedSourceEls.has(this.musicAudio))) {
      const nativeTrim = Math.min(1.15, getTrackTrimGain(this.activeMusicUrl));
      const base = this.desiredMode === 'paused' ? 0.18 : this.desiredMode === 'title' ? 0.38 : 0.56;
      this.musicAudio.volume = clamp(base * nativeTrim * this.musicVolume, 0, 1);
    }
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = clamp(volume, 0, 1);
    if (this.sfxBusGain && this.ctx) {
      this.sfxBusGain.gain.setTargetAtTime(
        0.72 * this.sfxVolume,
        this.ctx.currentTime,
        0.03
      );
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public resetStepTrack(): void {
    this.lastStepTriggered = -1;
    this.barIndex = 0;
    this.shiftRiserProgress = 0;
  }

  public isExternalMusicActive(): boolean {
    const bufferPlaying = Boolean(
      this.desiredTrackUrl &&
        this.activeBufferNode &&
        this.activeBufferUrl === this.desiredTrackUrl &&
        (this.desiredMode === 'playing' || this.desiredMode === 'title')
    );
    if (bufferPlaying) return true;
    return Boolean(
      this.desiredTrackUrl &&
        this.musicAudio &&
        this.activeMusicUrl === this.desiredTrackUrl &&
        (this.desiredMode === 'playing' || this.desiredMode === 'title') &&
        !this.musicAudio.paused &&
        !this.musicAudio.ended
    );
  }

  public notifyClockReset(): void {
    this.lastClockCtxTime = this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : null;
  }

  public setPlaybackTempoScale(scale: number): void {
    const clamped = clamp(scale, 0.85, 1.25);
    if (Math.abs(clamped - this.currentTempoScale) < 0.002) return;
    if (this.ctx && this.activeBufferNode) {
      const now = this.ctx.currentTime;
      const elapsedSinceAnchor = Math.max(0, now - this.bufferAnchorCtxTime);
      this.bufferAnchorRawPosSec += elapsedSinceAnchor * this.currentTempoScale;
      this.bufferAnchorCtxTime = now;
      try {
        this.activeBufferNode.playbackRate.setValueAtTime(clamped, now);
      } catch {
        // Ignore on stopped node
      }
    }
    this.currentTempoScale = clamped;
    if (this.musicAudio) {
      try {
        this.musicAudio.playbackRate = clamped;
      } catch {
        // Ignore unsupported playbackRate
      }
    }
  }

  /**
   * Computes current track beat directly from the playing AudioBuffer's hardware playback cursor
   * (`((ctx.currentTime - startTime) * rate + firstBeat) * bpm / 60` generalized across rate changes),
   * or returns `null` when falling back to synth / unbuffered audio.
   */
  public getBufferBeatPosition(): number | null {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.activeBufferNode ||
      this.activeBufferUrl !== this.desiredTrackUrl
    ) {
      return null;
    }
    const elapsedSinceAnchor = Math.max(0, this.ctx.currentTime - this.bufferAnchorCtxTime);
    const rawUnwrappedPosSec =
      this.bufferAnchorRawPosSec + elapsedSinceAnchor * this.currentTempoScale;
    return computeBeatFromBufferPosition({
      rawUnwrappedPosSec,
      firstBeatSec: this.activeLoopTiming.firstBeatSec,
      bpm: this.activeBufferBpm,
    });
  }

  /**
   * Advances timeline beat progress locked directly to AudioContext's hardware sample clock
   * whenever audio playback is running, falling back to clamped frame dt otherwise.
   */
  public consumeTimelineBeatDelta(fallbackDt: number, effectiveBpm: number): number {
    const safeDt = Math.max(0, Math.min(0.05, fallbackDt));
    if (
      this.ctx &&
      this.ctx.state === 'running' &&
      this.desiredMode === 'playing' &&
      (this.activeBufferNode !== null || this.isExternalMusicActive())
    ) {
      const nowCtx = this.ctx.currentTime;
      if (this.lastClockCtxTime === null) {
        this.lastClockCtxTime = nowCtx;
        return safeDt * (effectiveBpm / 60);
      }
      const hwDt = Math.max(0, Math.min(0.08, nowCtx - this.lastClockCtxTime));
      this.lastClockCtxTime = nowCtx;
      return hwDt * (effectiveBpm / 60);
    }
    this.lastClockCtxTime = null;
    return safeDt * (effectiveBpm / 60);
  }

  public getDecodedBufferCount(): number {
    return this.audioBuffers.size;
  }

  public getCachedBufferUrls(): string[] {
    return Array.from(this.audioBuffers.keys());
  }

  /**
   * Cache helper exposed so tests and runtime both enforce the strict 3-buffer memory cap.
   */
  public trimBufferCaches(keepUrl?: string): void {
    while (this.audioBuffers.size > MAX_DECODED_BUFFER_CACHE) {
      const oldestKey = this.audioBuffers.keys().next().value;
      if (!oldestKey) break;
      if (oldestKey === keepUrl || oldestKey === this.desiredTrackUrl) {
        const val = this.audioBuffers.get(oldestKey);
        this.audioBuffers.delete(oldestKey);
        if (val) this.audioBuffers.set(oldestKey, val);
        const nextOldest = this.audioBuffers.keys().next().value;
        if (!nextOldest || nextOldest === oldestKey) break;
        this.audioBuffers.delete(nextOldest);
      } else {
        this.audioBuffers.delete(oldestKey);
      }
    }
    while (this.rawTrackCache.size > MAX_RAW_TRACK_CACHE) {
      const oldestKey = this.rawTrackCache.keys().next().value;
      if (!oldestKey) break;
      if (oldestKey === keepUrl || oldestKey === this.desiredTrackUrl) {
        const val = this.rawTrackCache.get(oldestKey);
        this.rawTrackCache.delete(oldestKey);
        if (val) this.rawTrackCache.set(oldestKey, val);
        const nextOldest = this.rawTrackCache.keys().next().value;
        if (!nextOldest || nextOldest === oldestKey) break;
        this.rawTrackCache.delete(nextOldest);
      } else {
        this.rawTrackCache.delete(oldestKey);
      }
    }
  }

  private touchBufferLru(url: string, decoded: AudioBuffer): void {
    this.audioBuffers.delete(url);
    this.audioBuffers.set(url, decoded);
  }

  private touchRawLru(url: string, raw: ArrayBuffer): void {
    this.rawTrackCache.delete(url);
    this.rawTrackCache.set(url, raw);
  }

  private fetchTrackBytes(url: string): Promise<ArrayBuffer | null> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }
    const existing = this.rawTrackCache.get(url);
    if (existing) {
      this.touchRawLru(url, existing);
      return Promise.resolve(existing);
    }
    const inflight = this.rawFetchPromises.get(url);
    if (inflight) return inflight;

    const promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (buf && buf.byteLength > 0) {
          this.touchRawLru(url, buf);
          this.trimBufferCaches(url);
          return buf;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        this.rawFetchPromises.delete(url);
      });

    this.rawFetchPromises.set(url, promise);
    return promise;
  }

  private ensureBufferDecoded(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx || typeof window === 'undefined') {
      return Promise.resolve(null);
    }
    const cached = this.audioBuffers.get(url);
    if (cached) {
      this.touchBufferLru(url, cached);
      return Promise.resolve(cached);
    }
    const inflight = this.decodePromises.get(url);
    if (inflight) return inflight;

    const ctx = this.ctx;
    const promise = this.fetchTrackBytes(url)
      .then((raw) => {
        if (!raw) return null;
        return ctx.decodeAudioData(raw.slice(0));
      })
      .then((decoded) => {
        if (decoded) {
          this.touchBufferLru(url, decoded);
          this.trimBufferCaches(url);
          return decoded;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        this.decodePromises.delete(url);
      });

    this.decodePromises.set(url, promise);
    return promise;
  }

  public preloadTrack(url?: string): void {
    if (!url || typeof window === 'undefined') return;
    if (this.ctx) {
      void this.ensureBufferDecoded(url);
    } else {
      void this.fetchTrackBytes(url);
    }
  }

  public preloadTracks(urls: Array<string | undefined | null>): void {
    if (typeof window === 'undefined') return;
    const unique = Array.from(
      new Set(urls.filter((u): u is string => Boolean(u && u.length > 0)))
    ).slice(0, MAX_DECODED_BUFFER_CACHE);
    unique.forEach((url, idx) => {
      if (idx < 2) {
        this.preloadTrack(url);
      } else {
        window.setTimeout(() => {
          this.preloadTrack(url);
        }, idx * 240);
      }
    });
  }

  private attachAudioElementToGraph(
    el: HTMLAudioElement,
    initialGain = 0.02
  ): void {
    if (!this.ctx || !this.musicTrimGain || this.attachedSourceEls.has(el)) {
      return;
    }
    try {
      const src = this.ctx.createMediaElementSource(el);
      const elGain = this.ctx.createGain();
      const clampedInit = clamp(initialGain, 0, 1);
      elGain.gain.setValueAtTime(clampedInit, this.ctx.currentTime);
      el.volume = 1;
      src.connect(elGain);
      elGain.connect(this.musicTrimGain);
      this.mediaSources.set(el, src);
      this.elementGains.set(el, elGain);
      this.elementVolumes.set(el, clampedInit);
      this.attachedSourceEls.add(el);
    } catch {
      // Fallback to native HTMLAudioElement volume if Web Audio attachment fails
    }
  }

  private getElementVolume(el: HTMLAudioElement): number {
    if (this.attachedSourceEls.has(el)) {
      return this.elementVolumes.get(el) ?? 1;
    }
    return el.volume;
  }

  private setElementVolume(el: HTMLAudioElement, val: number): void {
    const v = clamp(val, 0, 1);
    this.elementVolumes.set(el, v);
    const elGain = this.elementGains.get(el);
    if (elGain && this.ctx) {
      elGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    } else {
      el.volume = v;
    }
  }

  private clearFadeTimer(el: HTMLAudioElement): void {
    const existing = this.audioFadeTimers.get(el);
    if (existing !== undefined && typeof window !== 'undefined') {
      window.clearInterval(existing);
      this.audioFadeTimers.delete(el);
    }
  }

  private fadeAudioVolume(
    el: HTMLAudioElement,
    targetVol: number,
    durationMs: number,
    onDone?: () => void
  ): void {
    if (typeof window === 'undefined') return;
    this.clearFadeTimer(el);
    const clampedTarget = clamp(targetVol, 0, 1);
    const startVol = this.getElementVolume(el);
    if (Math.abs(startVol - clampedTarget) < 0.015 || durationMs <= 0) {
      this.setElementVolume(el, clampedTarget);
      onDone?.();
      return;
    }
    const stepMs = durationMs >= 1000 ? 40 : 22;
    const steps = Math.max(1, Math.round(durationMs / stepMs));
    let step = 0;
    const fadingOut = clampedTarget < startVol;
    const id = window.setInterval(() => {
      step++;
      const linearT = Math.min(1, step / steps);
      const easedT = fadingOut
        ? 1 - Math.cos(linearT * Math.PI * 0.5)
        : Math.sin(linearT * Math.PI * 0.5);
      this.setElementVolume(el, startVol + (clampedTarget - startVol) * easedT);
      if (linearT >= 1) {
        window.clearInterval(id);
        this.audioFadeTimers.delete(el);
        onDone?.();
      }
    }, stepMs);
    this.audioFadeTimers.set(el, id);
  }

  private createEqualPowerCurve(
    direction: 'in' | 'out',
    startLevel = 1,
    points = 32
  ): Float32Array<ArrayBuffer> {
    const buf = new ArrayBuffer(points * 4);
    const curve = new Float32Array(buf);
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      if (direction === 'in') {
        curve[i] = Math.max(0.0005, Math.sin(t * Math.PI * 0.5) * startLevel);
      } else {
        curve[i] = Math.max(0.0001, Math.cos(t * Math.PI * 0.5) * startLevel);
      }
    }
    return curve;
  }

  private cancelAudioParamSafe(
    param: AudioParam | null | undefined,
    atTime: number
  ): void {
    if (!param) return;
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(atTime);
      } else {
        param.cancelScheduledValues(atTime);
      }
    } catch {
      try {
        param.cancelScheduledValues(atTime);
      } catch {
        // Ignore if parameter cannot be cancelled
      }
    }
  }

  private cleanupAudioElement(el: HTMLAudioElement): void {
    this.clearFadeTimer(el);
    this.fadingOutEls.delete(el);
    el.pause();
    el.currentTime = 0;
    el.src = '';
    const src = this.mediaSources.get(el);
    const elGain = this.elementGains.get(el);
    try {
      src?.disconnect();
      elGain?.disconnect();
    } catch {
      // Ignore already disconnected nodes
    }
  }

  private stopActiveBufferSource(fadeMs: number): void {
    const node = this.activeBufferNode;
    const gain = this.activeBufferGain;
    this.activeBufferNode = null;
    this.activeBufferGain = null;
    this.activeBufferUrl = null;
    this.activeBufferFadeEndCtxTime = 0;
    if (!node || !gain) return;

    if (!this.ctx || fadeMs <= 0) {
      try {
        node.stop();
        node.disconnect();
        gain.disconnect();
      } catch {
        // Ignore already stopped
      }
      return;
    }

    const entry = { node, gain };
    this.fadingBufferNodes.add(entry);
    const now = this.ctx.currentTime;
    const fadeSec = Math.max(0.04, fadeMs / 1000);
    this.cancelAudioParamSafe(gain.gain, now);
    const startGain = clamp(gain.gain.value, 0.0005, 1);
    try {
      gain.gain.setValueAtTime(startGain, now);
      gain.gain.setValueCurveAtTime(
        this.createEqualPowerCurve('out', startGain),
        now + 0.001,
        fadeSec
      );
      node.stop(now + fadeSec + 0.04);
    } catch {
      try {
        this.cancelAudioParamSafe(gain.gain, now);
        gain.gain.setValueAtTime(startGain, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        node.stop(now + fadeSec + 0.04);
      } catch {
        // Ignore already stopped
      }
    }
    node.onended = () => {
      this.fadingBufferNodes.delete(entry);
      try {
        node.disconnect();
        gain.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  private stopActiveMusic(fadeMs: number): void {
    this.stopActiveBufferSource(fadeMs);
    const oldEl = this.musicAudio;
    this.musicAudio = null;
    this.activeMusicUrl = null;
    if (!oldEl) return;

    if (fadeMs <= 0) {
      this.cleanupAudioElement(oldEl);
      return;
    }

    if (this.fadingOutEls.size >= 2) {
      const firstStale = Array.from(this.fadingOutEls)[0];
      if (firstStale) this.cleanupAudioElement(firstStale);
    }

    this.fadingOutEls.add(oldEl);
    this.fadeAudioVolume(oldEl, 0, fadeMs, () => {
      this.cleanupAudioElement(oldEl);
    });
  }

  public updateShiftRiser(riser01: number): void {
    const next = clamp(riser01, 0, 1);
    if (Math.abs(next - this.shiftRiserProgress) < 0.01) return;
    this.shiftRiserProgress = next;
    this.applyDynamicMusicShaping();
  }

  private applyDynamicMusicShaping(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const activeUrl = this.activeBufferUrl ?? this.activeMusicUrl;
    const trim = getTrackTrimGain(activeUrl);
    this.musicTrimGain?.gain.setTargetAtTime(trim, now, 0.06);

    let targetCutoff = 7600;
    let targetQ = 0.72;
    let targetBusGain = 0.46;
    let lowBand = 0.92;
    let midBand = 0.9;
    let highBand = 0.88;

    if (this.desiredMode === 'paused') {
      targetCutoff = 520;
      targetBusGain = 0.28;
      lowBand = 0.85;
      midBand = 0.55;
      highBand = 0.35;
    } else if (this.desiredMode === 'title') {
      targetCutoff = 8400;
      targetBusGain = 0.48;
      lowBand = 0.95;
      midBand = 0.92;
      highBand = 0.88;
    } else if (this.desiredMode === 'playing') {
      const intensity = clamp(
        this.lastStems.lead * 0.55 +
          this.lastStems.vocal * 0.45 +
          Math.min(0.4, this.lastComboLevel * 0.1),
        0,
        1.15
      );
      targetCutoff = 6200 + Math.min(1, intensity) * 13000;
      targetBusGain = clamp(
        0.58 + this.lastStems.lead * 0.12 + this.lastStems.vocal * 0.1,
        0.55,
        0.78
      );

      // Multiband 3-way reactive mix: bass, mids, highs respond independently to live board stems
      lowBand = clamp(
        0.74 +
          (this.lastStems.bass - 0.36) * 0.58 +
          Math.min(0.2, this.lastComboLevel * 0.05),
        0.72,
        1.22
      );
      midBand = clamp(
        0.64 + this.lastStems.lead * 0.44 + this.lastStems.vocal * 0.22,
        0.64,
        1.22
      );
      highBand = clamp(
        0.56 +
          this.lastStems.percussion * 0.34 +
          this.lastStems.vocal * 0.38 +
          Math.min(0.18, this.lastComboLevel * 0.045),
        0.56,
        1.24
      );

      // DJ-style Shift riser sweeps lowpass down + boosts Q over the final bar before Shift
      if (this.shiftRiserProgress > 0.01 && now >= this.transitionBloomUntilCtxTime) {
        const r = this.shiftRiserProgress;
        targetCutoff = targetCutoff * (1 - r) + 640 * r;
        targetQ = 0.72 + r * 3.6;
      }
    }

    if (now >= this.transitionBloomUntilCtxTime) {
      this.musicFilter?.frequency.setTargetAtTime(targetCutoff, now, 0.09);
      this.musicFilter?.Q.setTargetAtTime(targetQ, now, 0.08);
    }
    this.musicLowBandGain?.gain.setTargetAtTime(lowBand, now, 0.14);
    this.musicMidBandGain?.gain.setTargetAtTime(midBand, now, 0.14);
    this.musicHighBandGain?.gain.setTargetAtTime(highBand, now, 0.14);
    this.musicBusGain?.gain.setTargetAtTime(targetBusGain * this.musicVolume, now, 0.08);
  }

  private startDecodedBufferTrack(
    url: string,
    buffer: AudioBuffer,
    fadeMs: number,
    explicitOffsetSec?: number
  ): void {
    if (!this.ctx || !this.musicTrimGain) return;
    const now = this.ctx.currentTime;
    const skin = this.desiredSkin;
    const timing = skin
      ? resolveLoopTiming(skin, buffer.duration)
      : { firstBeatSec: 0, loopEndSec: buffer.duration, loopSweeps: 1 };

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = timing.firstBeatSec;
    src.loopEnd = timing.loopEndSec;
    src.playbackRate.setValueAtTime(this.currentTempoScale, now);

    // Start directly on firstBeatSec (skipping any silent intro) unless handing off mid-stream
    const loopLen = Math.max(0.5, timing.loopEndSec - timing.firstBeatSec);
    let safeOffset = timing.firstBeatSec;
    if (explicitOffsetSec !== undefined && explicitOffsetSec > timing.firstBeatSec) {
      safeOffset =
        timing.firstBeatSec + ((explicitOffsetSec - timing.firstBeatSec) % loopLen);
    }

    const gain = this.ctx.createGain();
    const fadeSec = Math.max(0.03, fadeMs / 1000);
    this.cancelAudioParamSafe(gain.gain, now);
    try {
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.setValueCurveAtTime(
        this.createEqualPowerCurve('in', 1),
        now + 0.001,
        fadeSec
      );
      this.activeBufferFadeEndCtxTime = now + 0.001 + fadeSec + 0.02;
    } catch {
      this.cancelAudioParamSafe(gain.gain, now);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(1, now + fadeSec);
      this.activeBufferFadeEndCtxTime = now + fadeSec + 0.02;
    }

    src.connect(gain);
    gain.connect(this.musicTrimGain);
    src.start(now, safeOffset);

    this.activeBufferNode = src;
    this.activeBufferGain = gain;
    this.activeBufferUrl = url;
    this.activeMusicUrl = url;
    this.activeLoopTiming = timing;
    this.activeBufferBpm = skin?.bpm ?? 120;
    this.bufferAnchorCtxTime = now;
    this.bufferAnchorRawPosSec = safeOffset;
    this.applyDynamicMusicShaping();
  }

  private ensureDesiredMusicPlaying(): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    if (this.desiredMode === 'gameover' || !this.desiredTrackUrl) {
      if (this.musicAudio || this.activeBufferNode) {
        this.stopActiveMusic(this.desiredMode === 'gameover' ? 380 : 260);
      }
      return;
    }

    if (this.desiredMode === 'title' && !this.unlockedByUser) {
      return;
    }

    const targetUrl = this.desiredTrackUrl;
    const isWebAudioRouted = Boolean(this.ctx && this.musicTrimGain);
    const nativeTrim = Math.min(1.15, getTrackTrimGain(targetUrl));
    const targetElVol = isWebAudioRouted
      ? 1
      : this.desiredMode === 'paused'
      ? 0.18 * this.musicVolume
      : this.desiredMode === 'title'
      ? clamp(0.38 * nativeTrim * this.musicVolume, 0, 0.85)
      : clamp(0.56 * nativeTrim * this.musicVolume, 0, 1);

    this.applyDynamicMusicShaping();

    // 1. Prefer gapless pre-decoded AudioBufferSourceNode whenever ready
    const decoded = isWebAudioRouted ? this.audioBuffers.get(targetUrl) : undefined;
    if (decoded && this.ctx && this.musicTrimGain) {
      if (this.activeBufferNode && this.activeBufferUrl === targetUrl) {
        if (
          this.activeBufferGain &&
          this.ctx.currentTime >= this.activeBufferFadeEndCtxTime
        ) {
          this.cancelAudioParamSafe(
            this.activeBufferGain.gain,
            this.ctx.currentTime
          );
          this.activeBufferGain.gain.setTargetAtTime(
            1,
            this.ctx.currentTime,
            0.08
          );
        }
        return;
      }

      // Filter-swap transition (~280ms) replaces the old 4.8s two-tempo overlap
      const isSameTrackHandoff = Boolean(this.musicAudio && this.activeMusicUrl === targetUrl);
      const handoffOffset = isSameTrackHandoff ? (this.musicAudio?.currentTime || undefined) : undefined;
      const swapFadeMs = isSameTrackHandoff ? 180 : this.desiredMode === 'playing' ? 280 : 260;

      if (!isSameTrackHandoff && this.musicFilter && (this.activeBufferNode || this.musicAudio)) {
        const now = this.ctx.currentTime;
        this.cancelAudioParamSafe(this.musicFilter.frequency, now);
        this.musicFilter.frequency.setValueAtTime(900, now);
        this.musicFilter.frequency.setTargetAtTime(14500, now + 0.12, 0.22);
        this.transitionBloomUntilCtxTime = now + 0.5;
      }

      this.stopActiveMusic(swapFadeMs);
      this.startDecodedBufferTrack(targetUrl, decoded, swapFadeMs, handoffOffset);
      return;
    }

    // Trigger background fetch + decode so playback upgrades cleanly to sample-accurate AudioBuffer
    if (isWebAudioRouted) {
      void this.ensureBufferDecoded(targetUrl).then((buf) => {
        if (
          buf &&
          this.desiredTrackUrl === targetUrl &&
          this.desiredMode !== 'gameover' &&
          this.activeBufferUrl !== targetUrl
        ) {
          this.ensureDesiredMusicPlaying();
        }
      });
    }

    // 2. Immediate HTMLAudioElement fallback while buffer downloads/decodes
    if (this.musicAudio && this.activeMusicUrl === targetUrl) {
      this.musicAudio.muted = this.muted;
      this.musicAudio.playbackRate = this.currentTempoScale;
      if (isWebAudioRouted) {
        this.attachAudioElementToGraph(
          this.musicAudio,
          this.getElementVolume(this.musicAudio)
        );
      }
      if (Math.abs(this.getElementVolume(this.musicAudio) - targetElVol) >= 0.015) {
        this.fadeAudioVolume(this.musicAudio, targetElVol, 160);
      }
      if (this.musicAudio.paused) {
        this.musicAudio.play().catch(() => {});
      }
      return;
    }

    const swapFadeMs = this.desiredMode === 'playing' ? 280 : 260;
    if (this.musicAudio || this.activeBufferNode) {
      this.stopActiveMusic(swapFadeMs);
    }

    const el = new Audio(targetUrl);
    el.loop = true;
    el.preload = 'auto';
    el.muted = this.muted;
    el.playbackRate = this.currentTempoScale;
    this.setElementVolume(el, 0.005);

    const startOffset = this.desiredSkin?.music.firstBeatSec ?? 0;
    if (startOffset > 0.05) {
      el.addEventListener(
        'loadedmetadata',
        () => {
          try {
            if (el.duration > startOffset + 1) {
              el.currentTime = startOffset;
            }
          } catch {
            // Ignore seek failure before ready
          }
        },
        { once: true }
      );
    }

    if (isWebAudioRouted) {
      this.attachAudioElementToGraph(el, 0.005);
    }

    this.musicAudio = el;
    this.activeMusicUrl = targetUrl;
    this.applyDynamicMusicShaping();

    el.play()
      .then(() => {
        if (this.musicAudio === el) {
          this.fadeAudioVolume(el, targetElVol, swapFadeMs);
        }
      })
      .catch(() => {
        // Browser autoplay prevented before gesture; will resume on unlock()
      });
  }

  public syncWorldMusic(
    skin: SkinConfig,
    mode: 'title' | 'playing' | 'paused' | 'gameover'
  ): void {
    this.desiredSkin = skin;
    this.desiredTrackUrl = skin.music.audioTrackUrl ?? null;
    this.desiredMode = mode;
    if (mode === 'playing') {
      this.notifyClockReset();
    }
    this.ensureDesiredMusicPlaying();
  }

  public updateMusicMix(
    _skin: SkinConfig,
    stems: StemLevels,
    comboLevel: number
  ): void {
    this.lastStems = stems;
    this.lastComboLevel = comboLevel;
    this.applyDynamicMusicShaping();
  }

  public getSpectrumSnapshot(): AudioSpectrumSnapshot {
    const emptyBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (
      this.muted ||
      !this.analyser ||
      !this.spectrumBins ||
      !this.ctx ||
      this.ctx.state !== 'running'
    ) {
      return {
        subBass: 0,
        mid: 0,
        high: 0,
        bands: emptyBands,
        hasLiveAudio: false,
      };
    }

    this.analyser.getByteFrequencyData(this.spectrumBins);
    const bins = this.spectrumBins;
    const len = bins.length;
    if (len < 16) {
      return {
        subBass: 0,
        mid: 0,
        high: 0,
        bands: emptyBands,
        hasLiveAudio: false,
      };
    }

    let subSum = 0;
    for (let i = 0; i <= 3; i++) subSum += bins[i];
    const subBass = clamp(subSum / (4 * 255), 0, 1);

    let midSum = 0;
    for (let i = 4; i <= 24; i++) midSum += bins[i];
    const mid = clamp(midSum / (21 * 255), 0, 1);

    let highSum = 0;
    const highEnd = Math.min(len - 1, 64);
    for (let i = 25; i <= highEnd; i++) highSum += bins[i];
    const high = clamp(highSum / (Math.max(1, highEnd - 24) * 255), 0, 1);

    const bandEdges = [0, 1, 2, 4, 7, 11, 16, 23, 33, 46, Math.min(len, 68)];
    const bands = new Array<number>(10);
    let peak = 0;
    for (let b = 0; b < 10; b++) {
      const start = bandEdges[b];
      const end = Math.max(start + 1, bandEdges[b + 1]);
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += bins[i];
      }
      const val = clamp(sum / ((end - start) * 255), 0, 1);
      bands[b] = val;
      if (val > peak) peak = val;
    }

    return {
      subBass,
      mid,
      high,
      bands,
      hasLiveAudio: peak > 0.018,
    };
  }

  private getDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const key = Math.round(amount * 20);
    const cached = this.distortionCache.get(key);
    if (cached) return cached as Float32Array<ArrayBuffer>;
    const k = amount * 60;
    const samples = 256;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.distortionCache.set(key, curve);
    return curve;
  }

  private ensureIosHapticSwitch(): HTMLLabelElement | null {
    if (this.iosHapticLabel || typeof document === 'undefined' || !document.body) {
      return this.iosHapticLabel;
    }
    try {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.position = 'fixed';
      label.style.left = '-9999px';
      label.style.top = '-9999px';
      label.style.width = '1px';
      label.style.height = '1px';
      label.style.opacity = '0.001';
      label.style.pointerEvents = 'none';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');

      label.appendChild(input);
      document.body.appendChild(label);
      this.iosHapticLabel = label;
      return label;
    } catch {
      return null;
    }
  }

  private triggerHaptic(pattern: number | number[]): void {
    if (!this.hapticsEnabled || this.muted) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
        return;
      } catch {
        // Fall through to iOS fallback
      }
    }
    // iOS Safari 17.4+/18+ Taptic Engine fallback via hidden <input type="checkbox" switch> label click
    if (typeof navigator !== 'undefined' && typeof document !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isAppleTouch =
        /iPad|iPhone|iPod/i.test(ua) ||
        (navigator.maxTouchPoints > 0 && /Macintosh/i.test(ua));
      if (isAppleTouch) {
        const nowMs = Date.now();
        if (nowMs - this.lastIosHapticMs >= 45) {
          this.lastIosHapticMs = nowMs;
          this.ensureIosHapticSwitch()?.click();
        }
      }
    }
  }

  private canSchedule(): boolean {
    return Boolean(
      !this.muted &&
        this.ctx &&
        this.masterGain &&
        this.ctx.state === 'running'
    );
  }

  private getScheduledSfxTime(bpm?: number, beatPos?: number): number {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    const liveBeat = beatPos ?? this.getBufferBeatPosition();
    if (liveBeat === null || !bpm || bpm <= 0) return now;
    const delay = computeQuantizedSfxDelaySec(liveBeat, bpm, 0.06);
    return now + delay;
  }

  private scheduleTone(
    when: number,
    dest: GainNode | null,
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    attack = 0.008,
    filterFreq = 2600,
    distortion = 0,
    pitchEndFreq?: number
  ): void {
    if (!this.canSchedule() || !this.ctx || !dest) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freq), when);
    if (pitchEndFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(24, pitchEndFreq),
        when + duration
      );
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, when);
    filter.Q.setValueAtTime(distortion > 0.35 ? 2.4 : 0.9, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, volume), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    if (distortion > 0.05) {
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.getDistortionCurve(distortion);
      shaper.oversample = '2x';
      osc.connect(shaper);
      shaper.connect(filter);
    } else {
      osc.connect(filter);
    }

    filter.connect(gain);
    gain.connect(dest);

    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  private scheduleNoise(
    when: number,
    dest: GainNode | null,
    duration: number,
    filterType: BiquadFilterType,
    filterFreq: number,
    q: number,
    volume: number
  ): void {
    if (!this.canSchedule() || !this.ctx || !dest || !this.noiseBuffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, when);
    filter.Q.setValueAtTime(q, when);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, volume), when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.start(when);
    src.stop(when + duration + 0.02);
  }

  private scheduleKick(when: number, vol: number, style: MusicStyleId): void {
    const startHz =
      style === 'trap' ||
      style === 'kizomba' ||
      style === 'dark_zouk' ||
      style === 'dub_techno' ||
      style === 'uk_garage' ||
      style === 'miami_boogie' ||
      style === 'nordic_synth' ||
      style === 'kraut_motorik'
        ? 105
        : style === 'heavy_metal' ||
          style === 'alt_rock' ||
          style === 'post_rock' ||
          style === 'industrial_synth' ||
          style === 'constructivist_march' ||
          style === 'koto_taiko'
        ? 145
        : 120;
    const endHz =
      style === 'trap' ||
      style === 'kizomba' ||
      style === 'reggaeton' ||
      style === 'dub_techno' ||
      style === 'uk_garage' ||
      style === 'industrial_synth' ||
      style === 'nordic_synth' ||
      style === 'koto_taiko'
        ? 36
        : 44;
    const dur =
      style === 'trap' ||
      style === 'kizomba' ||
      style === 'dub_techno' ||
      style === 'industrial_synth' ||
      style === 'koto_taiko'
        ? 0.28
        : 0.16;
    this.scheduleTone(
      when,
      this.stemPercGain,
      startHz,
      dur,
      'sine',
      vol,
      0.003,
      500,
      style === 'heavy_metal' || style === 'constructivist_march' || style === 'koto_taiko' ? 0.25 : 0,
      endHz
    );
    if (
      style === 'heavy_metal' ||
      style === 'alt_rock' ||
      style === 'liquid_dnb' ||
      style === 'post_rock' ||
      style === 'industrial_synth' ||
      style === 'constructivist_march' ||
      style === 'kraut_motorik'
    ) {
      this.scheduleNoise(when, this.stemPercGain, 0.018, 'bandpass', 3200, 1.8, vol * 0.28);
    }
  }

  private scheduleSnare(when: number, vol: number, style: MusicStyleId): void {
    if (
      style === 'salsa' ||
      style === 'bossa_nova' ||
      style === 'bachata' ||
      style === 'cumbia_dub' ||
      style === 'afrobeat_jazz' ||
      style === 'andean_cumbia' ||
      style === 'shamisen_chill' ||
      style === 'de_stijl_minimal' ||
      style === 'space_age_lounge'
    ) {
      this.scheduleTone(
        when,
        this.stemPercGain,
        style === 'bossa_nova' || style === 'shamisen_chill' || style === 'space_age_lounge' ? 880 : 1150,
        0.055,
        'triangle',
        vol * 0.65,
        0.002,
        3600
      );
      if (style === 'bachata' || style === 'cumbia_dub' || style === 'andean_cumbia') {
        this.scheduleNoise(when, this.stemPercGain, 0.04, 'highpass', 5200, 1.5, vol * 0.25);
      }
      return;
    }
    if (
      style === 'swing' ||
      style === 'country' ||
      style === 'ethio_jazz' ||
      style === 'tango_nuevo' ||
      style === 'cat_step_jazz' ||
      style === 'cubist_chamber' ||
      style === 'botanical_waltz' ||
      style === 'chamber_waltz' ||
      style === 'tokyo_jazz_kissa'
    ) {
      this.scheduleNoise(when, this.stemPercGain, 0.09, 'bandpass', 2800, 0.9, vol * 0.45);
      return;
    }
    this.scheduleTone(when, this.stemPercGain, 190, 0.09, 'triangle', vol * 0.55, 0.002, 1200, 0.15, 110);
    this.scheduleNoise(
      when,
      this.stemPercGain,
      style === 'synthwave' ||
        style === 'city_pop' ||
        style === 'industrial_synth' ||
        style === 'miami_boogie' ||
        style === 'memphis_electro' ||
        style === 'nordic_synth' ||
        style === 'analog_funk_70s'
        ? 0.18
        : 0.11,
      'highpass',
      style === 'trap' || style === 'uk_garage' ? 2400 : 1800,
      1.0,
      vol * 0.65
    );
  }

  private scheduleHat(when: number, vol: number, open: boolean, style: MusicStyleId): void {
    const dur = open ? 0.13 : 0.038;
    const freq =
      style === 'swing' ||
      style === 'ethio_jazz' ||
      style === 'cat_step_jazz' ||
      style === 'cubist_chamber' ||
      style === 'tokyo_jazz_kissa'
        ? 4600
        : style === 'bachata' || style === 'cumbia_dub' || style === 'andean_cumbia'
        ? 6200
        : style === 'trap' || style === 'uk_garage' || style === 'industrial_synth' || style === 'nordic_synth'
        ? 7800
        : 6400;
    this.scheduleNoise(
      when,
      this.stemPercGain,
      dur,
      style === 'swing' || style === 'cat_step_jazz' || style === 'tokyo_jazz_kissa' ? 'bandpass' : 'highpass',
      freq,
      style === 'swing' || style === 'cat_step_jazz' || style === 'tokyo_jazz_kissa' ? 2.6 : 1.0,
      vol
    );
  }

  private scheduleVocalPad(when: number, midi: number, dur: number, vol: number): void {
    if (!this.canSchedule() || !this.ctx || !this.stemVocalGain) return;
    const osc = this.ctx.createOscillator();
    const f1 = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), when);

    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(760, when);
    f1.frequency.linearRampToValueAtTime(1120, when + dur * 0.6);
    f1.Q.setValueAtTime(4.2, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vol, when + Math.min(0.06, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(f1);
    f1.connect(gain);
    gain.connect(this.stemVocalGain);

    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  /**
   * Called in lockstep with the 16-column horizontal timeline.
   */
  public syncStep(
    stepCol: number,
    skin: SkinConfig,
    stems: StemLevels = { percussion: 0.85, bass: 0.75, lead: 0.65, vocal: 0.45 }
  ): void {
    const col = ((stepCol % 16) + 16) % 16;
    if (col === this.lastStepTriggered) return;
    if (col === 0 && this.lastStepTriggered === 15) {
      this.barIndex = (this.barIndex + 1) % 4;
    }
    this.lastStepTriggered = col;

    if (!this.canSchedule() || !this.ctx) return;

    if (this.isExternalMusicActive()) {
      this.lastStems = stems;
      this.applyDynamicMusicShaping();
      this.stemPercGain?.gain.setTargetAtTime(0.95, this.ctx.currentTime, 0.1);
      this.stemLeadGain?.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.1);
      this.stemVocalGain?.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.1);
      return;
    }

    const now = this.ctx.currentTime;
    this.stemPercGain?.gain.setTargetAtTime(stems.percussion, now, 0.2);
    this.stemBassGain?.gain.setTargetAtTime(stems.bass, now, 0.25);
    this.stemLeadGain?.gain.setTargetAtTime(stems.lead, now, 0.28);
    this.stemVocalGain?.gain.setTargetAtTime(stems.vocal, now, 0.35);

    const { music } = skin;
    const style = music.styleId;
    const eighthDur = 30 / skin.bpm;
    const sixteenthDur = eighthDur * 0.5;
    const swingOffset = col % 2 === 1 ? music.swingRatio * eighthDur : 0;
    const when = now + swingOffset;

    const chordIdx = Math.floor(col / 4) % music.chords.length;
    const chord = music.chords[chordIdx];

    if (style === 'dark_zouk' || style === 'kizomba') {
      if (col % 4 === 0) this.scheduleKick(when, 0.34, style);
      if (col === 2 || col === 10) this.scheduleKick(when + sixteenthDur, 0.24, style);
      if (col % 4 === 2) this.scheduleSnare(when, 0.2, style);
      this.scheduleHat(when, col % 2 === 1 ? 0.06 : 0.03, false, style);
    } else if (style === 'reggaeton') {
      if (col % 4 === 0) this.scheduleKick(when, 0.36, style);
      if (col === 1 || col === 5 || col === 9 || col === 13) this.scheduleSnare(when + sixteenthDur, 0.26, style);
      if (col === 3 || col === 7 || col === 11 || col === 15) this.scheduleSnare(when, 0.24, style);
      this.scheduleHat(when, 0.045, false, style);
    } else if (style === 'trap') {
      if (col === 0 || col === 6 || col === 10) this.scheduleKick(when, 0.4, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.3, style);
      this.scheduleHat(when, col % 2 === 0 ? 0.08 : 0.05, false, style);
      if (col === 3 || col === 7 || col === 14 || col === 15) {
        this.scheduleHat(when + sixteenthDur * 0.5, 0.06, false, style);
        this.scheduleHat(when + sixteenthDur, 0.07, false, style);
      }
    } else if (style === 'salsa') {
      const claveCols = [0, 3, 6, 10, 12];
      if (claveCols.includes(col)) this.scheduleSnare(when, 0.28, style);
      if (col === 0 || col === 6 || col === 8 || col === 14) this.scheduleKick(when, 0.24, style);
      this.scheduleHat(when, col % 2 === 0 ? 0.06 : 0.04, col % 4 === 2, style);
    } else if (style === 'bachata') {
      if (col % 2 === 0) this.scheduleKick(when, col % 8 === 0 ? 0.28 : 0.2, style);
      if (col === 6 || col === 14) this.scheduleSnare(when, 0.28, style);
      this.scheduleHat(when, col % 2 === 1 ? 0.07 : 0.04, col % 4 === 3, style);
    } else if (style === 'swing') {
      if (col % 4 === 0) this.scheduleKick(when, 0.2, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.22, style);
      if (col % 2 === 0 || col % 4 === 3) {
        this.scheduleHat(when, col % 4 === 2 ? 0.09 : 0.055, col % 4 === 2, style);
      }
    } else if (style === 'heavy_metal') {
      this.scheduleKick(when, 0.34, style);
      if (col % 2 === 0) this.scheduleKick(when + sixteenthDur, 0.25, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.36, style);
      this.scheduleHat(when, 0.075, col % 4 === 0, style);
    } else if (style === 'liquid_dnb') {
      if (col === 0 || col === 10) this.scheduleKick(when, 0.34, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.3, style);
      this.scheduleHat(when, 0.06, false, style);
      this.scheduleHat(when + sixteenthDur, 0.04, false, style);
    } else if (
      style === 'ambient' ||
      style === 'dark_ambient' ||
      style === 'cathedral_organ' ||
      style === 'solarpunk_ambient' ||
      style === 'de_stijl_minimal'
    ) {
      if (col === 0 || col === 8) this.scheduleKick(when, 0.16, style);
      if (col % 4 === 2) this.scheduleHat(when, 0.03, true, style);
    } else if (style === 'uk_garage') {
      if (col === 0 || col === 6 || col === 10) this.scheduleKick(when, 0.34, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.28, style);
      this.scheduleHat(when, col % 2 === 1 ? 0.075 : 0.04, col === 14, style);
    } else if (
      style === 'dub_techno' ||
      style === 'flamenco_house' ||
      style === 'industrial_synth' ||
      style === 'miami_boogie' ||
      style === 'memphis_electro' ||
      style === 'constructivist_march' ||
      style === 'nordic_synth' ||
      style === 'kraut_motorik' ||
      style === 'analog_funk_70s'
    ) {
      if (
        col % 4 === 0 ||
        ((style === 'constructivist_march' || style === 'kraut_motorik') && col % 4 === 2)
      ) {
        this.scheduleKick(when, 0.32, style);
      }
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.24, style);
      if (col % 4 === 2 || style === 'memphis_electro' || style === 'nordic_synth') {
        this.scheduleHat(when, col % 2 === 1 ? 0.07 : 0.04, col % 4 === 2, style);
      }
    } else if (style === 'cat_step_jazz' || style === 'tokyo_jazz_kissa' || style === 'space_age_lounge') {
      if (col === 0 || col === 6 || col === 8) this.scheduleKick(when, 0.22, style);
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.2, style);
      if (col % 2 === 0 || col % 4 === 3) {
        this.scheduleHat(when, col % 4 === 2 ? 0.08 : 0.045, col % 4 === 2, style);
      }
    } else {
      if (
        col % 4 === 0 ||
        ((style === 'alt_rock' || style === 'post_rock' || style === 'afrobeat_jazz' || style === 'andean_cumbia' || style === 'koto_taiko') && col === 10)
      ) {
        this.scheduleKick(when, 0.28 * music.intensity, style);
      }
      if (col === 4 || col === 12) this.scheduleSnare(when, 0.25 * music.intensity, style);
      this.scheduleHat(when, col % 2 === 1 ? 0.065 : 0.035, col === 6 || col === 14, style);
    }

    const bassDegree = music.bassPattern[col % music.bassPattern.length];
    if (bassDegree >= 0) {
      const bassMidi = music.rootMidi - 12 + bassDegree;
      const bassFreq = midiToFreq(bassMidi);
      this.scheduleTone(
        when,
        this.stemBassGain,
        bassFreq,
        eighthDur * (style === 'heavy_metal' || style === 'constructivist_march' ? 0.85 : 1.45),
        music.bassWaveform,
        0.19 + music.subBassGain * 0.08,
        0.008,
        style === 'heavy_metal' || style === 'alt_rock' || style === 'industrial_synth' ? 1400 : 680,
        music.distortion * 0.75
      );
      if (music.subBassGain > 0.6) {
        this.scheduleTone(
          when,
          this.stemBassGain,
          bassFreq * 0.5,
          eighthDur * 1.6,
          'sine',
          0.16 * music.subBassGain,
          0.01,
          240
        );
      }
    }

    const arpDegree = music.arpPattern[col % music.arpPattern.length];
    if (arpDegree >= 0) {
      const scaleInterval = music.scale[arpDegree % music.scale.length];
      const leadMidi = music.rootMidi + 12 + scaleInterval;
      const leadFreq = midiToFreq(leadMidi);
      const isGuitarPluck =
        style === 'bachata' ||
        style === 'country' ||
        style === 'bossa_nova' ||
        style === 'blues_rock' ||
        style === 'shamisen_chill' ||
        style === 'botanical_waltz';
      const leadDur = isGuitarPluck
        ? eighthDur * 1.15
        : style === 'ambient' || style === 'dark_ambient' || style === 'cathedral_organ'
        ? eighthDur * 2.4
        : eighthDur * 1.4;

      this.scheduleTone(
        when,
        this.stemLeadGain,
        leadFreq,
        leadDur,
        music.waveform,
        0.1 * music.intensity,
        isGuitarPluck ? 0.003 : 0.01,
        style === 'heavy_metal' || style === 'alt_rock' || style === 'industrial_synth' ? 3200 : 2400,
        music.distortion
      );

      if ((style === 'heavy_metal' || style === 'alt_rock') && col % 2 === 0) {
        this.scheduleTone(
          when,
          this.stemLeadGain,
          midiToFreq(music.rootMidi + scaleInterval + 7),
          eighthDur * 0.9,
          'sawtooth',
          0.08,
          0.004,
          2600,
          music.distortion
        );
      } else if (style === 'salsa' && (col % 4 === 1 || col % 4 === 3)) {
        this.scheduleTone(
          when,
          this.stemLeadGain,
          leadFreq * 0.5,
          eighthDur * 0.8,
          'triangle',
          0.075,
          0.004,
          2600
        );
      }
    }

    if (col === 0 || col === 8) {
      for (let i = 0; i < Math.min(3, chord.length); i++) {
        this.scheduleVocalPad(when, music.rootMidi + chord[i], eighthDur * 3.8, 0.075);
      }
    } else if (
      (style === 'trap' || style === 'dark_zouk' || style === 'reggaeton' || style === 'liquid_dnb') &&
      (col === 6 || col === 14)
    ) {
      const topNote = chord[chord.length - 1] ?? 7;
      this.scheduleVocalPad(when, music.rootMidi + 12 + topNote, eighthDur * 0.9, 0.09);
    }
  }

  // ======================== SFX AS LIVE INSTRUMENTATION ========================

  private getSkinSfxProfile(skin?: SkinConfig): {
    family: 'wood_marimba' | 'analog_synth' | 'jazz_fender' | 'chip_minimal' | 'cathedral_glass' | 'rock_crunch' | 'dub_club';
    leadWave: OscillatorType;
    landWave: OscillatorType;
    brightnessHz: number;
    drive: number;
  } {
    const style = skin?.music.styleId ?? 'ambient';
    if (style === 'chiptune_funk' || style === 'de_stijl_minimal') {
      return {
        family: 'chip_minimal',
        leadWave: 'square',
        landWave: 'triangle',
        brightnessHz: 3200,
        drive: 0.08,
      };
    }
    if (
      style === 'salsa' ||
      style === 'bachata' ||
      style === 'bossa_nova' ||
      style === 'cumbia_dub' ||
      style === 'afrobeat_jazz' ||
      style === 'shamisen_chill' ||
      style === 'andean_cumbia' ||
      style === 'botanical_waltz' ||
      style === 'chamber_waltz' ||
      style === 'koto_taiko'
    ) {
      return {
        family: 'wood_marimba',
        leadWave: 'triangle',
        landWave: 'sine',
        brightnessHz: 2600,
        drive: 0.04,
      };
    }
    if (
      style === 'heavy_metal' ||
      style === 'alt_rock' ||
      style === 'blues_rock' ||
      style === 'industrial_synth' ||
      style === 'constructivist_march'
    ) {
      return {
        family: 'rock_crunch',
        leadWave: 'sawtooth',
        landWave: 'triangle',
        brightnessHz: 3400,
        drive: Math.max(0.28, skin?.music.distortion ?? 0.35),
      };
    }
    if (
      style === 'synthwave' ||
      style === 'miami_boogie' ||
      style === 'memphis_electro' ||
      style === 'nordic_synth' ||
      style === 'city_pop' ||
      style === 'analog_funk_70s' ||
      style === 'kraut_motorik'
    ) {
      return {
        family: 'analog_synth',
        leadWave: skin?.music.waveform ?? 'sawtooth',
        landWave: 'sine',
        brightnessHz: 3600,
        drive: 0.14,
      };
    }
    if (
      style === 'swing' ||
      style === 'jazz_fusion' ||
      style === 'ethio_jazz' ||
      style === 'cat_step_jazz' ||
      style === 'tokyo_jazz_kissa' ||
      style === 'neo_soul' ||
      style === 'space_age_lounge' ||
      style === 'cubist_chamber' ||
      style === 'tango_nuevo' ||
      style === 'flamenco_house'
    ) {
      return {
        family: 'jazz_fender',
        leadWave: 'sine',
        landWave: 'sine',
        brightnessHz: 2800,
        drive: 0.05,
      };
    }
    if (
      style === 'trap' ||
      style === 'reggaeton' ||
      style === 'kizomba' ||
      style === 'dark_zouk' ||
      style === 'dub_techno' ||
      style === 'uk_garage' ||
      style === 'liquid_dnb' ||
      style === 'funk_fusion' ||
      style === 'country'
    ) {
      return {
        family: 'dub_club',
        leadWave: skin?.music.waveform === 'sawtooth' ? 'triangle' : (skin?.music.waveform ?? 'triangle'),
        landWave: 'sine',
        brightnessHz: 3100,
        drive: 0.1,
      };
    }
    return {
      family: 'cathedral_glass',
      leadWave: 'sine',
      landWave: 'sine',
      brightnessHz: 4200,
      drive: 0,
    };
  }

  /**
   * Move tick with rapid-repeat throttling (>78ms cooldown) and subtle ascending scale ladder
   * so held DAS repeats don't machine-gun.
   */
  public playMove(skin?: SkinConfig, nowMsOverride?: number): boolean {
    const nowMs = nowMsOverride ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const deltaMs = nowMs - this.lastMoveSfxMs;
    if (deltaMs < 78) return false;

    if (deltaMs > 240) {
      this.moveLadderStep = 0;
    } else {
      this.moveLadderStep = Math.min(7, this.moveLadderStep + 1);
    }
    this.lastMoveSfxMs = nowMs;

    if (!this.canSchedule() || !this.ctx) return true;
    const now = this.ctx.currentTime;
    const profile = this.getSkinSfxProfile(skin);
    const root = skin?.music.rootMidi ?? 60;
    const scale = skin?.music.scale?.length ? skin.music.scale : [0, 2, 4, 7, 9];
    const ladderSemi = scale[this.moveLadderStep % scale.length] + Math.floor(this.moveLadderStep / scale.length) * 12;
    const ladderGain = this.moveLadderStep > 0 ? 0.74 : 1;
    const rootTickFreq = midiToFreq(root + 24 + Math.min(12, ladderSemi));

    if (profile.family === 'chip_minimal') {
      this.scheduleTone(now, this.stemPercGain, rootTickFreq * 1.12, 0.022, 'square', 0.036 * ladderGain, 0.002, 2600);
    } else if (profile.family === 'wood_marimba') {
      this.scheduleTone(now, this.stemPercGain, rootTickFreq, 0.032, 'triangle', 0.062 * ladderGain, 0.002, 2400, 0, rootTickFreq * 0.85);
    } else if (profile.family === 'rock_crunch') {
      this.scheduleNoise(now, this.stemPercGain, 0.024, 'bandpass', 2300 + this.moveLadderStep * 120, 2.0, 0.072 * ladderGain);
      this.scheduleTone(now, this.stemPercGain, midiToFreq(root + ladderSemi), 0.028, 'triangle', 0.034 * ladderGain, 0.002, 1100, 0.2);
    } else if (profile.family === 'analog_synth') {
      this.scheduleNoise(now, this.stemPercGain, 0.02, 'highpass', 6800, 1.4, 0.062 * ladderGain);
      this.scheduleTone(now, this.stemPercGain, rootTickFreq * 1.5, 0.02, 'sawtooth', 0.024 * ladderGain, 0.002, 3200, 0, rootTickFreq);
    } else if (profile.family === 'jazz_fender') {
      this.scheduleNoise(now, this.stemPercGain, 0.024, 'bandpass', 4300 + this.moveLadderStep * 140, 1.6, 0.056 * ladderGain);
      this.scheduleTone(now, this.stemPercGain, rootTickFreq, 0.022, 'sine', 0.028 * ladderGain, 0.002, 2200);
    } else if (profile.family === 'dub_club') {
      this.scheduleNoise(now, this.stemPercGain, 0.02, 'highpass', 7200, 1.4, 0.065 * ladderGain);
      this.scheduleTone(now, this.stemPercGain, rootTickFreq, 0.02, 'sine', 0.022 * ladderGain, 0.002, 2600);
    } else {
      this.scheduleTone(now, this.stemPercGain, rootTickFreq * 1.5, 0.036, 'sine', 0.04 * ladderGain, 0.002, 4200);
      this.scheduleNoise(now, this.stemPercGain, 0.018, 'highpass', 5800, 1.2, 0.032 * ladderGain);
    }
    return true;
  }

  public playRotate(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const profile = this.getSkinSfxProfile(skin);
    const chord = music.chords[this.rotateCursor % music.chords.length];
    const deg = chord[this.rotateCursor % chord.length] ?? 0;
    this.rotateCursor = (this.rotateCursor + 1) % 16;

    const freq = midiToFreq(music.rootMidi + 12 + deg);

    if (profile.family === 'chip_minimal') {
      this.scheduleTone(now, this.stemLeadGain, freq, 0.045, 'square', 0.068, 0.002, 3200);
      this.scheduleTone(now + 0.028, this.stemLeadGain, freq * 1.25, 0.055, 'square', 0.052, 0.002, 3400);
    } else if (profile.family === 'wood_marimba') {
      this.scheduleTone(now, this.stemLeadGain, freq, 0.11, 'triangle', 0.115, 0.002, 2600);
      this.scheduleTone(now, this.stemLeadGain, freq * 2, 0.045, 'sine', 0.04, 0.001, 4200);
    } else if (profile.family === 'jazz_fender') {
      this.scheduleTone(now, this.stemLeadGain, freq, 0.13, 'sine', 0.105, 0.003, 2800);
      this.scheduleTone(now, this.stemLeadGain, freq * 3, 0.035, 'sine', 0.03, 0.002, 4600);
    } else if (profile.family === 'cathedral_glass') {
      this.scheduleTone(now, this.stemLeadGain, freq, 0.16, 'sine', 0.095, 0.008, 4200);
      this.scheduleTone(now + 0.014, this.stemLeadGain, freq * 1.5, 0.14, 'triangle', 0.042, 0.008, 4400);
    } else if (profile.family === 'rock_crunch') {
      this.scheduleTone(now, this.stemLeadGain, freq, 0.09, 'sawtooth', 0.082, 0.002, 2900, profile.drive);
      this.scheduleTone(now, this.stemLeadGain, freq * 1.5, 0.08, 'sawtooth', 0.052, 0.002, 2700, profile.drive * 0.7);
    } else {
      this.scheduleTone(
        now,
        this.stemLeadGain,
        freq,
        0.1,
        profile.leadWave,
        0.105,
        0.003,
        profile.brightnessHz,
        profile.drive * 0.5
      );
    }
  }

  public playLand(skin?: SkinConfig, effectiveBpm?: number, beatPos?: number): void {
    this.triggerHaptic(8);
    if (!this.canSchedule() || !this.ctx) return;
    const when = this.getScheduledSfxTime(effectiveBpm ?? skin?.bpm, beatPos);
    const root = skin?.music.rootMidi ?? 60;
    const profile = this.getSkinSfxProfile(skin);
    const subGain = skin?.music.subBassGain ?? 0.5;

    if (profile.family === 'wood_marimba') {
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root + 5), 0.045, 'triangle', 0.068, 0.002, 1600, 0, midiToFreq(root - 2));
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root - 12) * 1.4, 0.13, 'sine', 0.14, 0.003, 720, 0, midiToFreq(root - 24));
    } else if (profile.family === 'chip_minimal') {
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root + 7), 0.036, 'square', 0.048, 0.002, 1800, 0, midiToFreq(root - 12));
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root - 12), 0.09, 'triangle', 0.12, 0.002, 900);
    } else if (profile.family === 'cathedral_glass') {
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root), 0.09, 'sine', 0.075, 0.004, 1500);
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root - 12), 0.14, 'sine', 0.115, 0.006, 620);
    } else if (profile.family === 'rock_crunch') {
      this.scheduleNoise(when, this.stemPercGain, 0.02, 'bandpass', 2600, 1.8, 0.065);
      this.scheduleTone(when, this.stemPercGain, midiToFreq(root - 12) * 1.5, 0.11, 'triangle', 0.145, 0.002, 820, 0.22, midiToFreq(root - 24));
    } else {
      this.scheduleTone(
        when,
        this.stemPercGain,
        midiToFreq(root) * 1.15,
        0.048,
        profile.landWave,
        0.065,
        0.002,
        1400,
        0,
        midiToFreq(root - 5)
      );
      this.scheduleTone(
        when,
        this.stemPercGain,
        midiToFreq(root - 12) * 1.35,
        0.11,
        'sine',
        0.145,
        0.003,
        680,
        profile.drive * 0.4,
        midiToFreq(root - 24)
      );
    }
    if (subGain >= 0.78) {
      this.scheduleTone(
        when,
        this.stemPercGain,
        midiToFreq(root - 12),
        0.13,
        'sine',
        0.095,
        0.004,
        240,
        0,
        38
      );
    }
  }

  /**
   * Quantized square-formed chime whose pitch climbs smoothly along the track's scale
   * as squares accumulate in the stack (`squaresInStack`) or chains activate.
   */
  public playSquareFormed(
    skin: SkinConfig,
    squaresInStack = 0,
    chainLength = 0,
    effectiveBpm?: number,
    beatPos?: number
  ): void {
    if (!this.canSchedule() || !this.ctx) return;
    const when = this.getScheduledSfxTime(effectiveBpm ?? skin.bpm, beatPos);
    const scale = skin.music.scale.length > 0 ? skin.music.scale : [0, 2, 4, 7, 9];
    const stackStep = Math.max(0, Math.min(8, Math.max(0, squaresInStack - 1) + Math.min(3, chainLength)));
    const stackSemi = scale[stackStep % scale.length] + Math.floor(stackStep / scale.length) * 12;
    const root = skin.music.rootMidi + 12 + stackSemi;
    const profile = this.getSkinSfxProfile(skin);
    const chord = skin.music.chords[0] ?? [0, 4, 7];
    const thirdOrFourth = chord[1] ?? 4;

    if (profile.family === 'wood_marimba') {
      this.scheduleTone(when, this.stemLeadGain, midiToFreq(root), 0.19, 'triangle', 0.1, 0.002, 2600);
      this.scheduleTone(when + 0.032, this.stemLeadGain, midiToFreq(root + thirdOrFourth), 0.21, 'triangle', 0.09, 0.002, 2800);
      this.scheduleTone(when + 0.064, this.stemLeadGain, midiToFreq(root + 7), 0.24, 'sine', 0.08, 0.004, 3000);
    } else if (profile.family === 'jazz_fender') {
      this.scheduleTone(when, this.stemLeadGain, midiToFreq(root), 0.24, 'sine', 0.09, 0.004, 2800);
      this.scheduleTone(when + 0.025, this.stemLeadGain, midiToFreq(root + thirdOrFourth), 0.25, 'sine', 0.08, 0.004, 3000);
      this.scheduleTone(when + 0.05, this.stemLeadGain, midiToFreq(root + (chord[3] ?? 11)), 0.28, 'triangle', 0.055, 0.006, 3200);
    } else if (profile.family === 'chip_minimal') {
      this.scheduleTone(when, this.stemLeadGain, midiToFreq(root), 0.08, 'square', 0.072, 0.002, 3200);
      this.scheduleTone(when + 0.045, this.stemLeadGain, midiToFreq(root + 7), 0.12, 'square', 0.072, 0.002, 3400);
    } else {
      this.scheduleVocalPad(when, root, 0.22, 0.105);
      this.scheduleTone(
        when + 0.02,
        this.stemLeadGain,
        midiToFreq(root + 7),
        0.24,
        profile.leadWave,
        0.095,
        0.01,
        profile.brightnessHz,
        profile.drive * 0.35
      );
    }
  }

  /**
   * Celebratory harmonic sting + 1-beat wide filter bloom for ALL DELETED (+10,000) and SINGLE COLOR (+1,000).
   */
  public playBonusSting(
    skin: SkinConfig,
    kind: 'all_deleted' | 'single_color',
    effectiveBpm?: number
  ): void {
    this.triggerHaptic(kind === 'all_deleted' ? [18, 28, 22, 34] : [14, 20, 16]);
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bpm = Math.max(60, effectiveBpm ?? skin.bpm);
    const beatDurSec = 60 / bpm;
    const root = skin.music.rootMidi + 12;
    const scale = skin.music.scale.length >= 4 ? skin.music.scale : [0, 2, 4, 7, 9];
    const profile = this.getSkinSfxProfile(skin);

    const intervals =
      kind === 'all_deleted'
        ? [0, scale[2] ?? 4, scale[4] ?? 7, 12, 12 + (scale[2] ?? 4), 24]
        : [0, scale[2] ?? 4, scale[4] ?? 7, 12];

    intervals.forEach((semi, idx) => {
      const t = now + idx * 0.042;
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(root + semi),
        kind === 'all_deleted' ? 0.52 : 0.34,
        idx % 2 === 0 ? 'triangle' : profile.leadWave,
        kind === 'all_deleted' ? 0.115 : 0.095,
        0.006,
        5200,
        profile.drive * 0.2
      );
    });
    this.scheduleVocalPad(now + 0.03, root + 12, beatDurSec * 0.9, 0.12);

    // One-beat filter open bloom
    if (this.musicFilter) {
      this.cancelAudioParamSafe(this.musicFilter.frequency, now);
      this.musicFilter.Q.setTargetAtTime(0.72, now, 0.03);
      this.musicFilter.frequency.setTargetAtTime(19800, now, 0.03);
      this.transitionBloomUntilCtxTime = Math.max(
        this.transitionBloomUntilCtxTime,
        now + beatDurSec
      );
    }
  }

  public playSweepColumnNote(
    skin: SkinConfig,
    sweepSquareCount: number,
    cellsCleared: number
  ): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const profile = this.getSkinSfxProfile(skin);
    const scale = music.scale.length > 0 ? music.scale : [0, 2, 4, 7, 9];
    const stepIdx = Math.max(0, sweepSquareCount);
    const octaveShift = Math.floor(stepIdx / scale.length) * 12;
    const semi = scale[stepIdx % scale.length];
    const freq = midiToFreq(music.rootMidi + 12 + Math.min(24, octaveShift) + semi);

    this.scheduleTone(
      now,
      this.stemLeadGain,
      freq,
      profile.family === 'chip_minimal' ? 0.1 : 0.17,
      profile.family === 'rock_crunch' ? 'triangle' : profile.leadWave,
      profile.family === 'chip_minimal' ? 0.068 : 0.088,
      profile.family === 'cathedral_glass' ? 0.01 : 0.004,
      profile.brightnessHz,
      profile.drive * 0.25
    );
    if (cellsCleared >= 4 || profile.family === 'jazz_fender' || profile.family === 'cathedral_glass') {
      this.scheduleTone(
        now + 0.016,
        this.stemLeadGain,
        freq * 1.5,
        0.18,
        'sine',
        cellsCleared >= 4 ? 0.06 : 0.036,
        0.006,
        4000
      );
    }
  }

  public playShiftChord(skin: SkinConfig): void {
    this.shiftRiserProgress = 0;
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const profile = this.getSkinSfxProfile(skin);
    const chord = music.chords[0] ?? [0, 4, 7];
    chord.slice(0, 4).forEach((semi, idx) => {
      this.scheduleTone(
        now + idx * 0.035,
        this.stemLeadGain,
        midiToFreq(music.rootMidi + 12 + semi),
        profile.family === 'cathedral_glass' ? 0.36 : 0.26,
        profile.leadWave,
        profile.family === 'chip_minimal' ? 0.06 : 0.082,
        0.006,
        profile.brightnessHz,
        profile.drive * 0.25
      );
    });
    // Snap DJ riser open cleanly on shift drop
    if (this.musicFilter) {
      this.cancelAudioParamSafe(this.musicFilter.frequency, now);
      this.musicFilter.Q.setTargetAtTime(0.72, now, 0.03);
      this.musicFilter.frequency.setTargetAtTime(17500, now, 0.035);
      this.transitionBloomUntilCtxTime = Math.max(
        this.transitionBloomUntilCtxTime,
        now + 0.45
      );
    }
  }

  public playFlowShift(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const profile = this.getSkinSfxProfile(skin);
    const intervals = [0, 7, 12, 19];
    intervals.forEach((semi, i) => {
      const t = now + i * 0.04;
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(music.rootMidi + 12 + semi),
        0.24,
        profile.family === 'chip_minimal' ? 'square' : 'triangle',
        profile.family === 'chip_minimal' ? 0.055 : 0.072,
        0.008,
        profile.brightnessHz
      );
    });
    this.triggerHaptic([10, 14]);
  }

  public playSweepClear(squares: number, comboLevel: number, skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const profile = this.getSkinSfxProfile(skin);
    const root = music.rootMidi + 12;
    const scale = music.scale;
    const stepCount = squares >= 4 ? 5 : 3;
    const bonusOffset = Math.min(comboLevel, 3);

    for (let idx = 0; idx < stepCount; idx++) {
      const interval = scale[(idx + bonusOffset) % scale.length];
      const t = now + idx * (profile.family === 'chip_minimal' ? 0.034 : 0.044);
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(root + interval),
        profile.family === 'cathedral_glass' ? 0.4 : 0.32,
        profile.leadWave,
        profile.family === 'chip_minimal' ? 0.088 : 0.12,
        0.005,
        profile.brightnessHz,
        profile.drive * 0.35
      );
      if (idx === stepCount - 1) {
        this.scheduleVocalPad(t, root + interval, 0.44, 0.12);
      }
    }
    if (squares >= 2 && this.musicFilter) {
      this.musicFilter.frequency.setTargetAtTime(
        Math.min(19500, 11000 + squares * 1400),
        now,
        0.06
      );
    }
    this.triggerHaptic(squares >= 4 ? [14, 24, 18] : 12);
  }

  public playChainTrigger(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const root = skin.music.rootMidi + 12;
    const profile = this.getSkinSfxProfile(skin);
    const chord = skin.music.chords[1] ?? skin.music.chords[0] ?? [0, 4, 7, 11];
    const chainIntervals = [0, chord[1] ?? 4, chord[2] ?? 7, chord[3] ?? 11, 14];
    chainIntervals.forEach((semi, i) => {
      const t = now + i * 0.036;
      this.scheduleVocalPad(t, root + semi, 0.36, 0.105);
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(root + 12 + semi),
        0.22,
        profile.leadWave,
        profile.family === 'chip_minimal' ? 0.05 : 0.065,
        0.008,
        profile.brightnessHz
      );
    });
    this.triggerHaptic([12, 18, 24]);
  }

  public playSkinTransition(skin: SkinConfig): void {
    this.shiftRiserProgress = 0;
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const root = skin.music.rootMidi + 12;
    const scale = skin.music.scale.length >= 4 ? skin.music.scale : [0, 2, 4, 7, 9];
    const shimmerNotes = [
      root,
      root + (scale[1] ?? 4),
      root + (scale[3] ?? 7),
      root + 12,
    ];
    shimmerNotes.forEach((midi, i) => {
      const t = now + i * 0.095;
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(midi),
        0.55,
        'triangle',
        0.055,
        0.025,
        4200
      );
    });
    this.scheduleVocalPad(now + 0.06, root, 1.45, 0.048);
    this.scheduleVocalPad(now + 0.24, root + 7, 1.45, 0.042);

    if (this.musicFilter) {
      this.cancelAudioParamSafe(this.musicFilter.frequency, now);
      this.musicFilter.Q.setTargetAtTime(0.72, now, 0.04);
      this.musicFilter.frequency.setValueAtTime(1400, now);
      this.musicFilter.frequency.setTargetAtTime(14500, now + 0.04, 0.28);
      this.transitionBloomUntilCtxTime = now + 0.85;
    }
  }

  public playGameOver(): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    [60, 57, 53, 48].forEach((midi, i) => {
      this.scheduleTone(
        now + i * 0.095,
        this.stemLeadGain,
        midiToFreq(midi),
        0.45,
        'triangle',
        0.13,
        0.02,
        1400
      );
    });
  }
}
