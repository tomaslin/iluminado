import { BoardState, MusicStyleId, SkinConfig } from './types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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
    0.14 +
      (formedCount > 0 ? 0.42 : 0) +
      stageRatio * 0.44,
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

  private musicTrimGain: GainNode | null = null;
  private musicLowShelf: BiquadFilterNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicBusGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private distortionCache = new Map<number, WaveShaperNode['curve']>();

  private musicAudio: HTMLAudioElement | null = null;
  private activeMusicUrl: string | null = null;
  private desiredTrackUrl: string | null = null;
  private desiredMode: 'title' | 'playing' | 'paused' | 'gameover' = 'title';
  private audioFadeTimers = new WeakMap<HTMLAudioElement, number>();
  private mediaSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private elementGains = new WeakMap<HTMLAudioElement, GainNode>();
  private elementVolumes = new WeakMap<HTMLAudioElement, number>();
  private attachedSourceEls = new WeakSet<HTMLAudioElement>();
  private fadingOutEls = new Set<HTMLAudioElement>();

  // Decoded AudioBuffer cache + gapless AudioBufferSourceNode playback
  private rawTrackCache = new Map<string, ArrayBuffer>();
  private rawFetchPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private audioBuffers = new Map<string, AudioBuffer>();
  private decodePromises = new Map<string, Promise<AudioBuffer | null>>();
  private activeBufferNode: AudioBufferSourceNode | null = null;
  private activeBufferGain: GainNode | null = null;
  private activeBufferUrl: string | null = null;
  private fadingBufferNodes = new Set<{ node: AudioBufferSourceNode; gain: GainNode }>();
  private currentTempoScale = 1;
  private lastClockCtxTime: number | null = null;

  private unlockedByUser = false;
  private muted = false;
  private hapticsEnabled = true;
  private lastStepTriggered = -1;
  private barIndex = 0;
  private rotateCursor = 0;
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
      this.sfxBusGain.gain.value = 0.64;

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

      // Dedicated studio-track mastering & dynamic reactive shaping bus
      this.musicTrimGain = this.ctx.createGain();
      this.musicTrimGain.gain.value = getTrackTrimGain(this.activeMusicUrl);

      this.musicLowShelf = this.ctx.createBiquadFilter();
      this.musicLowShelf.type = 'lowshelf';
      this.musicLowShelf.frequency.value = 135;
      this.musicLowShelf.gain.value = 0.8;

      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 7200;
      this.musicFilter.Q.value = 0.72;

      this.musicBusGain = this.ctx.createGain();
      this.musicBusGain.gain.value = 0.46;

      this.musicTrimGain.connect(this.musicLowShelf);
      this.musicLowShelf.connect(this.musicFilter);
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

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public resetStepTrack(): void {
    this.lastStepTriggered = -1;
    this.barIndex = 0;
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
    this.currentTempoScale = clamped;
    if (this.activeBufferNode && this.ctx) {
      try {
        this.activeBufferNode.playbackRate.setTargetAtTime(clamped, this.ctx.currentTime, 0.12);
      } catch {
        // Ignore on stopped node
      }
    }
    if (this.musicAudio) {
      try {
        this.musicAudio.playbackRate = clamped;
      } catch {
        // Ignore unsupported playbackRate
      }
    }
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

  private trimBufferCaches(keepUrl?: string): void {
    while (this.audioBuffers.size > 4) {
      const oldestKey = this.audioBuffers.keys().next().value;
      if (!oldestKey || oldestKey === keepUrl || oldestKey === this.desiredTrackUrl) break;
      this.audioBuffers.delete(oldestKey);
    }
    while (this.rawTrackCache.size > 5) {
      const oldestKey = this.rawTrackCache.keys().next().value;
      if (!oldestKey || oldestKey === keepUrl || oldestKey === this.desiredTrackUrl) break;
      this.rawTrackCache.delete(oldestKey);
    }
  }

  private fetchTrackBytes(url: string): Promise<ArrayBuffer | null> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }
    const existing = this.rawTrackCache.get(url);
    if (existing) return Promise.resolve(existing);
    const inflight = this.rawFetchPromises.get(url);
    if (inflight) return inflight;

    const promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (buf && buf.byteLength > 0) {
          this.rawTrackCache.set(url, buf);
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
    if (cached) return Promise.resolve(cached);
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
          this.audioBuffers.set(url, decoded);
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
    const stepMs = durationMs >= 1000 ? 45 : 25;
    const steps = Math.max(1, Math.round(durationMs / stepMs));
    let step = 0;
    const id = window.setInterval(() => {
      step++;
      const linearT = Math.min(1, step / steps);
      // Smooth S-curve crossfade so outgoing and incoming worlds breathe organically
      const easedT = linearT * linearT * (3 - 2 * linearT);
      this.setElementVolume(el, startVol + (clampedTarget - startVol) * easedT);
      if (linearT >= 1) {
        window.clearInterval(id);
        this.audioFadeTimers.delete(el);
        onDone?.();
      }
    }, stepMs);
    this.audioFadeTimers.set(el, id);
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
    const fadeSec = Math.max(0.05, fadeMs / 1000);
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      node.stop(now + fadeSec + 0.04);
    } catch {
      // Ignore already stopped
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

    // Keep at most one overlapping fade-out stream during gradual transitions
    if (this.fadingOutEls.size >= 2) {
      const firstStale = Array.from(this.fadingOutEls)[0];
      if (firstStale) this.cleanupAudioElement(firstStale);
    }

    this.fadingOutEls.add(oldEl);
    this.fadeAudioVolume(oldEl, 0, fadeMs, () => {
      this.cleanupAudioElement(oldEl);
    });
  }

  private applyDynamicMusicShaping(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const activeUrl = this.activeBufferUrl ?? this.activeMusicUrl;
    const trim = getTrackTrimGain(activeUrl);
    this.musicTrimGain?.gain.setTargetAtTime(trim, now, 0.06);

    let targetCutoff = 7200;
    let targetLowShelf = 0.8;
    let targetBusGain = 0.46;

    if (this.desiredMode === 'paused') {
      targetCutoff = 520;
      targetLowShelf = 0;
      targetBusGain = 0.28;
    } else if (this.desiredMode === 'title') {
      targetCutoff = 7200;
      targetLowShelf = 1.1;
      targetBusGain = 0.44;
    } else if (this.desiredMode === 'playing') {
      const intensity = clamp(
        this.lastStems.lead * 0.55 +
          this.lastStems.vocal * 0.45 +
          Math.min(0.4, this.lastComboLevel * 0.1),
        0,
        1.15
      );
      targetCutoff = 5200 + Math.min(1, intensity) * 14000;
      targetLowShelf = clamp(
        (this.lastStems.bass - 0.35) * 4.5 +
          Math.min(1.8, this.lastComboLevel * 0.45),
        0,
        4.2
      );
      targetBusGain = clamp(
        0.56 + this.lastStems.lead * 0.14 + this.lastStems.vocal * 0.1,
        0.54,
        0.78
      );
    }

    this.musicFilter?.frequency.setTargetAtTime(targetCutoff, now, 0.12);
    this.musicLowShelf?.gain.setTargetAtTime(targetLowShelf, now, 0.14);
    this.musicBusGain?.gain.setTargetAtTime(targetBusGain, now, 0.12);
  }

  private startDecodedBufferTrack(
    url: string,
    buffer: AudioBuffer,
    fadeMs: number,
    startOffsetSec = 0
  ): void {
    if (!this.ctx || !this.musicTrimGain) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.setValueAtTime(this.currentTempoScale, now);

    const gain = this.ctx.createGain();
    const safeOffset =
      buffer.duration > 0.1
        ? ((startOffsetSec % buffer.duration) + buffer.duration) % buffer.duration
        : 0;
    const fadeSec = Math.max(0.05, fadeMs / 1000);
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(1, now + fadeSec);

    src.connect(gain);
    gain.connect(this.musicTrimGain);
    src.start(now, safeOffset);

    this.activeBufferNode = src;
    this.activeBufferGain = gain;
    this.activeBufferUrl = url;
    this.activeMusicUrl = url;
    this.applyDynamicMusicShaping();
  }

  private ensureDesiredMusicPlaying(): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    if (this.desiredMode === 'gameover' || !this.desiredTrackUrl) {
      if (this.musicAudio || this.activeBufferNode) {
        this.stopActiveMusic(this.desiredMode === 'gameover' ? 420 : 280);
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
      ? 0.18
      : this.desiredMode === 'title'
      ? clamp(0.38 * nativeTrim, 0.15, 0.75)
      : clamp(0.56 * nativeTrim, 0.25, 0.95);

    this.applyDynamicMusicShaping();

    // 1. Prefer gapless pre-decoded AudioBufferSourceNode whenever ready
    const decoded = isWebAudioRouted ? this.audioBuffers.get(targetUrl) : undefined;
    if (decoded && this.ctx && this.musicTrimGain) {
      if (this.activeBufferNode && this.activeBufferUrl === targetUrl) {
        this.activeBufferGain?.gain.setTargetAtTime(1, this.ctx.currentTime, 0.08);
        return;
      }
      const crossfadeMs = this.desiredMode === 'playing' ? 4800 : 750;
      let handoffOffset = 0;
      let actualFadeMs = crossfadeMs;
      if (this.musicAudio && this.activeMusicUrl === targetUrl) {
        // Seamless short handoff from initial streaming <audio> into decoded buffer
        handoffOffset = this.musicAudio.currentTime || 0;
        actualFadeMs = 260;
      }
      this.stopActiveMusic(actualFadeMs);
      this.startDecodedBufferTrack(targetUrl, decoded, actualFadeMs, handoffOffset);
      return;
    }

    // Trigger background fetch + decode so next loop / handoff upgrades to gapless AudioBuffer
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

    // 2. Immediate HTMLAudioElement playback while buffer downloads/decodes (or when unattached)
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
        this.fadeAudioVolume(this.musicAudio, targetElVol, 180);
      }
      if (this.musicAudio.paused) {
        this.musicAudio.play().catch(() => {});
      }
      return;
    }

    const crossfadeMs = this.desiredMode === 'playing' ? 4800 : 750;
    if (this.musicAudio || this.activeBufferNode) {
      this.stopActiveMusic(crossfadeMs);
    }

    const el = new Audio(targetUrl);
    el.loop = true;
    el.preload = 'auto';
    el.muted = this.muted;
    el.playbackRate = this.currentTempoScale;
    this.setElementVolume(el, 0.005);

    if (isWebAudioRouted) {
      this.attachAudioElementToGraph(el, 0.005);
    }

    this.musicAudio = el;
    this.activeMusicUrl = targetUrl;
    this.applyDynamicMusicShaping();

    el.play()
      .then(() => {
        if (this.musicAudio === el) {
          this.fadeAudioVolume(el, targetElVol, crossfadeMs);
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

  private triggerHaptic(pattern: number | number[]): void {
    if (!this.hapticsEnabled || this.muted) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore in unsupported environments
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
      style === 'uk_garage'
        ? 105
        : style === 'heavy_metal' || style === 'alt_rock' || style === 'post_rock'
        ? 145
        : 120;
    const endHz =
      style === 'trap' ||
      style === 'kizomba' ||
      style === 'reggaeton' ||
      style === 'dub_techno' ||
      style === 'uk_garage'
        ? 36
        : 44;
    const dur =
      style === 'trap' || style === 'kizomba' || style === 'dub_techno' ? 0.28 : 0.16;
    this.scheduleTone(
      when,
      this.stemPercGain,
      startHz,
      dur,
      'sine',
      vol,
      0.003,
      500,
      style === 'heavy_metal' ? 0.25 : 0,
      endHz
    );
    if (
      style === 'heavy_metal' ||
      style === 'alt_rock' ||
      style === 'liquid_dnb' ||
      style === 'post_rock'
    ) {
      // Beater click transient
      this.scheduleNoise(when, this.stemPercGain, 0.018, 'bandpass', 3200, 1.8, vol * 0.28);
    }
  }

  private scheduleSnare(when: number, vol: number, style: MusicStyleId): void {
    if (
      style === 'salsa' ||
      style === 'bossa_nova' ||
      style === 'bachata' ||
      style === 'cumbia_dub' ||
      style === 'afrobeat_jazz'
    ) {
      // Crisp wooden clave / rim knock or bongo slap
      this.scheduleTone(
        when,
        this.stemPercGain,
        style === 'bossa_nova' ? 880 : 1150,
        0.055,
        'triangle',
        vol * 0.65,
        0.002,
        3600
      );
      if (style === 'bachata' || style === 'cumbia_dub') {
        this.scheduleNoise(when, this.stemPercGain, 0.04, 'highpass', 5200, 1.5, vol * 0.25);
      }
      return;
    }
    if (style === 'swing' || style === 'country' || style === 'ethio_jazz' || style === 'tango_nuevo') {
      // Brushed snare sweep / crisp bandoneon slap
      this.scheduleNoise(when, this.stemPercGain, 0.09, 'bandpass', 2800, 0.9, vol * 0.45);
      return;
    }
    // Tight punchy snare / clap
    this.scheduleTone(when, this.stemPercGain, 190, 0.09, 'triangle', vol * 0.55, 0.002, 1200, 0.15, 110);
    this.scheduleNoise(
      when,
      this.stemPercGain,
      style === 'synthwave' || style === 'city_pop' ? 0.18 : 0.11,
      'highpass',
      style === 'trap' || style === 'uk_garage' ? 2400 : 1800,
      1.0,
      vol * 0.65
    );
  }

  private scheduleHat(when: number, vol: number, open: boolean, style: MusicStyleId): void {
    const dur = open ? 0.13 : 0.038;
    const freq =
      style === 'swing' || style === 'ethio_jazz'
        ? 4600
        : style === 'bachata' || style === 'cumbia_dub'
        ? 6200 // güira scrape
        : style === 'trap' || style === 'uk_garage'
        ? 7800
        : 6400;
    this.scheduleNoise(
      when,
      this.stemPercGain,
      dur,
      style === 'swing' ? 'bandpass' : 'highpass',
      freq,
      style === 'swing' ? 2.6 : 1.0,
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

    // Warm vocal formant bandpass sweep ("ah -> oh")
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
   * Schedules eighth-note + swung/16th-note subdivisions across 4 independent dynamic stems.
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

    // When the world's real MP3 soundtrack is actively playing, suppress synth backing stems
    // so live gameplay SFX + dynamic EQ filtering integrate cleanly with the studio track.
    if (this.isExternalMusicActive()) {
      this.lastStems = stems;
      this.applyDynamicMusicShaping();
      this.stemPercGain?.gain.setTargetAtTime(0.95, this.ctx.currentTime, 0.1);
      this.stemLeadGain?.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.1);
      this.stemVocalGain?.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.1);
      return;
    }

    const now = this.ctx.currentTime;
    // Update dynamic stem mix buses smoothly
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

    // ======================== 1. PERCUSSION STEM ========================
    if (style === 'dark_zouk' || style === 'kizomba') {
      // Sensual Caribbean/Angolan heartbeat kick: 0, 3 (16th offbeat), 4, 8, 11, 12
      if (col % 4 === 0) {
        this.scheduleKick(when, 0.34, style);
      }
      if (col === 2 || col === 10) {
        // Syncopated 16th pickup kick before beat 2 & 4
        this.scheduleKick(when + sixteenthDur, 0.24, style);
      }
      if (col % 4 === 2) {
        this.scheduleSnare(when, 0.2, style);
      }
      this.scheduleHat(when, col % 2 === 1 ? 0.06 : 0.03, false, style);
    } else if (style === 'reggaeton') {
      // Classic Dembow: Kick on 0, 4, 8, 12; Snare syncopated on offbeats 1.5 & 3, 5.5 & 7...
      if (col % 4 === 0) {
        this.scheduleKick(when, 0.36, style);
      }
      if (col === 1 || col === 5 || col === 9 || col === 13) {
        this.scheduleSnare(when + sixteenthDur, 0.26, style);
      }
      if (col === 3 || col === 7 || col === 11 || col === 15) {
        this.scheduleSnare(when, 0.24, style);
      }
      this.scheduleHat(when, 0.045, false, style);
    } else if (style === 'trap') {
      // Half-time 808 kick + crisp clap on beats 3 & 7 (col 4 & 12) + skittering 32nd hi-hat rolls
      if (col === 0 || col === 6 || col === 10) {
        this.scheduleKick(when, 0.4, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.3, style);
      }
      this.scheduleHat(when, col % 2 === 0 ? 0.08 : 0.05, false, style);
      if (col === 3 || col === 7 || col === 14 || col === 15) {
        this.scheduleHat(when + sixteenthDur * 0.5, 0.06, false, style);
        this.scheduleHat(when + sixteenthDur, 0.07, false, style);
      }
    } else if (style === 'salsa') {
      // 3-2 Son Clave on 8th-note grid [0, 3, 6, 10, 12] + cascara hats
      const claveCols = [0, 3, 6, 10, 12];
      if (claveCols.includes(col)) {
        this.scheduleSnare(when, 0.28, style);
      }
      if (col === 0 || col === 6 || col === 8 || col === 14) {
        this.scheduleKick(when, 0.24, style);
      }
      this.scheduleHat(when, col % 2 === 0 ? 0.06 : 0.04, col % 4 === 2, style);
    } else if (style === 'bachata') {
      // Bongo martillo + güira scrape + beat-4 pop accent
      if (col % 2 === 0) {
        this.scheduleKick(when, col % 8 === 0 ? 0.28 : 0.2, style);
      }
      if (col === 6 || col === 14) {
        // Classic Bachata beat 4 accent!
        this.scheduleSnare(when, 0.28, style);
      }
      this.scheduleHat(when, col % 2 === 1 ? 0.07 : 0.04, col % 4 === 3, style);
    } else if (style === 'swing') {
      // Swung jazz ride cymbal ("spang-a-lang") + brush backbeat on 4 & 12
      if (col % 4 === 0) {
        this.scheduleKick(when, 0.2, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.22, style);
      }
      if (col % 2 === 0 || col % 4 === 3) {
        this.scheduleHat(when, col % 4 === 2 ? 0.09 : 0.055, col % 4 === 2, style);
      }
    } else if (style === 'heavy_metal') {
      // Relentless double-kick 16ths + snare backbeat on 4 & 12
      this.scheduleKick(when, 0.34, style);
      if (col % 2 === 0) {
        this.scheduleKick(when + sixteenthDur, 0.25, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.36, style);
      }
      this.scheduleHat(when, 0.075, col % 4 === 0, style);
    } else if (style === 'liquid_dnb') {
      // Two-step DnB breakbeat: kick on 0 & 10, snappy snare on 4 & 12, fast 16th hats
      if (col === 0 || col === 10) {
        this.scheduleKick(when, 0.34, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.3, style);
      }
      this.scheduleHat(when, 0.06, false, style);
      this.scheduleHat(when + sixteenthDur, 0.04, false, style);
    } else if (style === 'ambient' || style === 'dark_ambient') {
      // Minimal atmospheric pulse & soft tactile ticks
      if (col === 0 || col === 8) {
        this.scheduleKick(when, 0.16, style);
      }
      if (col % 4 === 2) {
        this.scheduleHat(when, 0.03, true, style);
      }
    } else if (style === 'uk_garage') {
      // 2-step syncopated kick (0, 6, 10) + crisp backbeat snare (4, 12) + swung 16th hats
      if (col === 0 || col === 6 || col === 10) {
        this.scheduleKick(when, 0.34, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.28, style);
      }
      this.scheduleHat(when, col % 2 === 1 ? 0.075 : 0.04, col === 14, style);
    } else if (style === 'dub_techno' || style === 'flamenco_house') {
      // Four-on-the-floor pulse with crisp offbeat hats & claps
      if (col % 4 === 0) {
        this.scheduleKick(when, 0.32, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.24, style);
      }
      if (col % 4 === 2) {
        this.scheduleHat(when, 0.08, true, style);
      }
    } else {
      // Country, Jazz Fusion, Bossa, Alt Rock, Synthwave, Chiptune, Trip-Hop, Blues Rock, Afrobeat, Neo Soul, Cumbia, City Pop, Ethio-Jazz, Tango Nuevo, Post-Rock
      if (
        col % 4 === 0 ||
        ((style === 'alt_rock' || style === 'post_rock' || style === 'afrobeat_jazz') && col === 10)
      ) {
        this.scheduleKick(when, 0.28 * music.intensity, style);
      }
      if (col === 4 || col === 12) {
        this.scheduleSnare(when, 0.25 * music.intensity, style);
      }
      this.scheduleHat(when, col % 2 === 1 ? 0.065 : 0.035, col === 6 || col === 14, style);
    }

    // ======================== 2. BASS STEM ========================
    const bassDegree = music.bassPattern[col % music.bassPattern.length];
    if (bassDegree >= 0) {
      const bassMidi = music.rootMidi - 12 + bassDegree;
      const bassFreq = midiToFreq(bassMidi);
      this.scheduleTone(
        when,
        this.stemBassGain,
        bassFreq,
        eighthDur * (style === 'heavy_metal' ? 0.85 : 1.45),
        music.bassWaveform,
        0.19 + music.subBassGain * 0.08,
        0.008,
        style === 'heavy_metal' || style === 'alt_rock' ? 1400 : 680,
        music.distortion * 0.75
      );
      if (music.subBassGain > 0.6) {
        // Pure sub-octave reinforcement for Trap / Kizomba / Dark Zouk / Reggaeton / DnB
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

    // ======================== 3. LEAD / HARMONY STEM ========================
    const arpDegree = music.arpPattern[col % music.arpPattern.length];
    if (arpDegree >= 0) {
      const scaleInterval = music.scale[arpDegree % music.scale.length];
      const leadMidi = music.rootMidi + 12 + scaleInterval;
      const leadFreq = midiToFreq(leadMidi);
      const isGuitarPluck =
        style === 'bachata' ||
        style === 'country' ||
        style === 'bossa_nova' ||
        style === 'blues_rock';
      const leadDur = isGuitarPluck
        ? eighthDur * 1.15
        : style === 'ambient' || style === 'dark_ambient'
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
        style === 'heavy_metal' || style === 'alt_rock' ? 3200 : 2400,
        music.distortion
      );

      // Metal / Alt Rock / Salsa rhythmic power-chord or montuno double-stop
      if (
        (style === 'heavy_metal' || style === 'alt_rock') &&
        col % 2 === 0
      ) {
        this.scheduleTone(
          when,
          this.stemLeadGain,
          midiToFreq(music.rootMidi + scaleInterval + 7), // Fifth power chord
          eighthDur * 0.9,
          'sawtooth',
          0.08,
          0.004,
          2600,
          music.distortion
        );
      } else if (style === 'salsa' && (col % 4 === 1 || col % 4 === 3)) {
        // Montuno piano octave comping
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

    // ======================== 4. VOCAL / PAD STEM ========================
    if (col === 0 || col === 8) {
      for (let i = 0; i < Math.min(3, chord.length); i++) {
        this.scheduleVocalPad(
          when,
          music.rootMidi + chord[i],
          eighthDur * 3.8,
          0.075
        );
      }
    } else if (
      (style === 'trap' || style === 'dark_zouk' || style === 'reggaeton' || style === 'liquid_dnb') &&
      (col === 6 || col === 14)
    ) {
      // Rhythmic vocal chop accent
      const topNote = chord[chord.length - 1] ?? 7;
      this.scheduleVocalPad(when, music.rootMidi + 12 + topNote, eighthDur * 0.9, 0.09);
    }
  }

  // ======================== SFX AS LIVE INSTRUMENTATION ========================

  public playMove(skin?: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const style = skin?.music.styleId ?? 'ambient';
    if (style === 'chiptune_funk') {
      // Crisp 8-bit square navigation blip
      this.scheduleTone(now, this.stemPercGain, 920, 0.025, 'square', 0.045, 0.002, 2600);
    } else if (
      style === 'salsa' ||
      style === 'bachata' ||
      style === 'bossa_nova' ||
      style === 'cumbia_dub' ||
      style === 'afrobeat_jazz' ||
      style === 'flamenco_house' ||
      style === 'tango_nuevo'
    ) {
      // Soft woodblock / shaker tick
      this.scheduleTone(now, this.stemPercGain, 980, 0.032, 'triangle', 0.075, 0.002, 2400);
    } else if (style === 'heavy_metal' || style === 'alt_rock' || style === 'post_rock') {
      // Palm-muted pick scratch
      this.scheduleNoise(now, this.stemPercGain, 0.028, 'bandpass', 2200, 2.0, 0.09);
    } else if (
      style === 'trap' ||
      style === 'reggaeton' ||
      style === 'liquid_dnb' ||
      style === 'uk_garage'
    ) {
      // Tight high-transient hi-hat tick
      this.scheduleNoise(now, this.stemPercGain, 0.024, 'highpass', 7200, 1.4, 0.08);
    } else if (
      style === 'kizomba' ||
      style === 'dark_zouk' ||
      style === 'neo_soul' ||
      style === 'dub_techno'
    ) {
      // Warm brushed shaker tick
      this.scheduleNoise(now, this.stemPercGain, 0.028, 'bandpass', 4400, 1.5, 0.07);
    } else {
      // Crisp hi-hat tick
      this.scheduleNoise(now, this.stemPercGain, 0.03, 'highpass', 5800, 1.2, 0.075);
    }
  }

  public playRotate(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const chord = music.chords[this.rotateCursor % music.chords.length];
    const deg = chord[this.rotateCursor % chord.length] ?? 0;
    this.rotateCursor = (this.rotateCursor + 1) % 16;

    const freq = midiToFreq(music.rootMidi + 12 + deg);
    this.scheduleTone(
      now,
      this.stemLeadGain,
      freq,
      0.095,
      music.waveform,
      0.11,
      0.003,
      2800,
      music.distortion * 0.5
    );
  }

  public playLand(skin?: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const root = skin?.music.rootMidi ?? 60;
    const style = skin?.music.styleId ?? 'ambient';
    const subGain = skin?.music.subBassGain ?? 0.5;
    // Soft ceramic/wooden tap transient + warm low body locked to root key
    this.scheduleTone(
      now,
      this.stemPercGain,
      midiToFreq(root) * 1.15,
      0.048,
      'triangle',
      0.065,
      0.002,
      1400,
      0,
      midiToFreq(root - 5)
    );
    this.scheduleTone(
      now,
      this.stemPercGain,
      midiToFreq(root - 12) * 1.35,
      0.11,
      'sine',
      0.145,
      0.003,
      680,
      style === 'heavy_metal' ? 0.16 : 0,
      midiToFreq(root - 24)
    );
    if (subGain >= 0.8) {
      // Sub-octave weight punch for deep groove stages
      this.scheduleTone(
        now,
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
    this.triggerHaptic(8);
  }

  public playSquareFormed(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const root = skin.music.rootMidi + 12;
    this.scheduleVocalPad(now, root, 0.22, 0.11);
    this.scheduleTone(
      now + 0.02,
      this.stemLeadGain,
      midiToFreq(root + 7),
      0.24,
      skin.music.waveform,
      0.1,
      0.01,
      3000,
      skin.music.distortion * 0.35
    );
  }

  public playSweepColumnNote(
    skin: SkinConfig,
    sweepSquareCount: number,
    cellsCleared: number
  ): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const scale = music.scale.length > 0 ? music.scale : [0, 2, 4, 7, 9];
    const stepIdx = Math.max(0, sweepSquareCount);
    const octaveShift = Math.floor(stepIdx / scale.length) * 12;
    const semi = scale[stepIdx % scale.length];
    const freq = midiToFreq(music.rootMidi + 12 + Math.min(24, octaveShift) + semi);

    this.scheduleTone(
      now,
      this.stemLeadGain,
      freq,
      0.16,
      music.waveform === 'sawtooth' ? 'triangle' : music.waveform,
      0.085,
      0.004,
      3200,
      music.distortion * 0.2
    );
    if (cellsCleared >= 4) {
      this.scheduleTone(
        now + 0.015,
        this.stemLeadGain,
        freq * 1.5,
        0.18,
        'sine',
        0.055,
        0.006,
        3600
      );
    }
  }

  public playShiftChord(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const chord = music.chords[0] ?? [0, 4, 7];
    chord.slice(0, 3).forEach((semi, idx) => {
      this.scheduleTone(
        now + idx * 0.035,
        this.stemLeadGain,
        midiToFreq(music.rootMidi + 12 + semi),
        0.26,
        music.waveform,
        0.085,
        0.006,
        3200,
        music.distortion * 0.25
      );
    });
    if (this.musicFilter) {
      this.musicFilter.frequency.setTargetAtTime(14000, now, 0.08);
    }
  }

  public playPeggleBounce(skin: SkinConfig, bounceIdx: number = 0): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const scale = music.scale.length > 0 ? music.scale : [0, 2, 4, 7, 9];
    const semi = scale[Math.abs(bounceIdx) % scale.length];
    const octaveBonus = Math.min(12, Math.floor(Math.max(0, bounceIdx) / scale.length) * 12);
    const freq = midiToFreq(music.rootMidi + 12 + octaveBonus + semi);
    this.scheduleTone(
      now,
      this.stemLeadGain,
      freq,
      0.13,
      'sine',
      0.095,
      0.002,
      4800,
      0,
      freq * 1.18
    );
    this.scheduleTone(
      now + 0.014,
      this.stemLeadGain,
      freq * 2,
      0.09,
      'triangle',
      0.042,
      0.002,
      5400
    );
    this.triggerHaptic(6);
  }

  public playFlowShift(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const intervals = [0, 7, 12, 19];
    intervals.forEach((semi, i) => {
      const t = now + i * 0.04;
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(music.rootMidi + 12 + semi),
        0.24,
        'triangle',
        0.072,
        0.008,
        3600
      );
    });
    this.triggerHaptic([10, 14]);
  }

  public playSweepClear(squares: number, comboLevel: number, skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { music } = skin;
    const root = music.rootMidi + 12;
    const scale = music.scale;
    const stepCount = squares >= 4 ? 5 : 3;
    const bonusOffset = Math.min(comboLevel, 3);

    for (let idx = 0; idx < stepCount; idx++) {
      const interval = scale[(idx + bonusOffset) % scale.length];
      const t = now + idx * 0.042;
      this.scheduleTone(
        t,
        this.stemLeadGain,
        midiToFreq(root + interval),
        0.32,
        music.waveform,
        0.13,
        0.005,
        3600,
        music.distortion * 0.4
      );
      if (idx === stepCount - 1) {
        this.scheduleVocalPad(t, root + interval, 0.42, 0.12);
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
    [0, 4, 7, 11, 14].forEach((semi, i) => {
      const t = now + i * 0.036;
      this.scheduleVocalPad(t, root + semi, 0.35, 0.11);
    });
    this.triggerHaptic([12, 18, 24]);
  }

  public playSkinTransition(skin: SkinConfig): void {
    if (!this.canSchedule() || !this.ctx) return;
    // Whisper-soft ambient harmonic swell so world transitions glide transparently in the background
    const now = this.ctx.currentTime;
    const root = skin.music.rootMidi + 12;
    [0, 7].forEach((semi, i) => {
      const t = now + i * 0.22;
      this.scheduleVocalPad(t, root + semi, 1.4, 0.042);
    });
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
