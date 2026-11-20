import React, { useEffect, useMemo } from 'react';
import {
  ALL_SHIFT_TYPES,
  SHIFT_CATEGORY_LABELS,
  SHIFT_DEFINITIONS,
  START_FRIENDLY_SHIFTS,
  ShiftCategory,
  ShiftDefinition,
} from '../game/shifts';
import { ShiftType, SkinConfig } from '../game/types';

interface ShiftSettingsModalProps {
  isOpen: boolean;
  enabledShifts: ShiftType[];
  skin: SkinConfig;
  onChangeEnabledShifts: (next: ShiftType[]) => void;
  onClose: () => void;
}

const CATEGORIES: ShiftCategory[] = ['core', 'silhouette', 'obstacles', 'bricks', 'swaps'];

const SHIFT_DEFINITIONS_BY_CATEGORY: Record<ShiftCategory, ShiftDefinition[]> = {
  core: SHIFT_DEFINITIONS.filter((d) => d.category === 'core'),
  silhouette: SHIFT_DEFINITIONS.filter((d) => d.category === 'silhouette'),
  obstacles: SHIFT_DEFINITIONS.filter((d) => d.category === 'obstacles'),
  bricks: SHIFT_DEFINITIONS.filter((d) => d.category === 'bricks'),
  swaps: SHIFT_DEFINITIONS.filter((d) => d.category === 'swaps'),
};

export const ShiftSettingsModal: React.FC<ShiftSettingsModalProps> = ({
  isOpen,
  enabledShifts,
  skin,
  onChangeEnabledShifts,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  const enabledSet = useMemo(() => new Set<ShiftType>(enabledShifts), [enabledShifts]);

  if (!isOpen) return null;

  const { palette } = skin;

  const toggleShift = (id: ShiftType) => {
    if (enabledSet.has(id)) {
      onChangeEnabledShifts(enabledShifts.filter((s) => s !== id));
    } else {
      onChangeEnabledShifts([...enabledShifts, id]);
    }
  };

  const applyPreset = (
    preset:
      | 'all'
      | 'start_ready'
      | 'classic'
      | 'silhouette'
      | 'obstacles'
      | 'bricks'
      | 'swaps'
      | 'none'
  ) => {
    if (preset === 'all') {
      onChangeEnabledShifts([...ALL_SHIFT_TYPES]);
    } else if (preset === 'start_ready') {
      onChangeEnabledShifts([...START_FRIENDLY_SHIFTS]);
    } else if (preset === 'classic') {
      onChangeEnabledShifts(['rotate_90']);
    } else if (preset === 'none') {
      onChangeEnabledShifts([]);
    } else {
      onChangeEnabledShifts(SHIFT_DEFINITIONS_BY_CATEGORY[preset].map((d) => d.id));
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(18, 15, 28, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Board Shift Settings"
      data-testid="shift-settings-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden animate-modal-in"
        style={{
          backgroundColor: '#faf7f1',
          border: `1px solid ${palette.boardFrame}`,
        }}
      >
        <div
          className="w-full max-h-[88vh] flex flex-col overflow-hidden"
          style={{
            backgroundColor: palette.hudCardBg,
            color: palette.hudInk,
          }}
        >
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#201c2c]/10 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider font-mono-tabular"
              style={{ color: palette.hudAccent }}
            >
              Opening + Level-Up Mutations · {enabledShifts.length} of{' '}
              {ALL_SHIFT_TYPES.length} Active
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-0.5">
              Board Shift Rules
            </h2>
            <p className="text-xs sm:text-sm mt-1" style={{ color: palette.hudMuted }}>
              Runs begin with one Start-Ready shift and evolve on every level up. Brick-dependent shifts unlock as stacks grow.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Shift Settings"
            data-testid="close-shift-settings"
            className="min-h-[44px] px-4 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-transform active:scale-95"
            style={{
              backgroundColor: palette.hudInk,
              color: '#faf6ee',
            }}
          >
            Done
          </button>
        </div>

        <div className="px-5 sm:px-6 py-3 border-b border-[#201c2c]/10 flex flex-wrap items-center gap-2 shrink-0">
          {(
            [
              ['all', `All (${ALL_SHIFT_TYPES.length})`],
              ['start_ready', `Start-Ready (${START_FRIENDLY_SHIFTS.length})`],
              ['classic', '90° Rotate Only'],
              ['silhouette', 'Reshapes Only'],
              ['obstacles', 'Obstacles Only'],
              ['bricks', 'Bricks & Colors'],
              ['swaps', 'Swaps Only'],
              ['none', 'Disable All'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              data-testid={`preset-${key}`}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              style={{
                backgroundColor: 'rgba(32, 28, 44, 0.06)',
                color: palette.hudInk,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {CATEGORIES.map((category) => {
            const items = SHIFT_DEFINITIONS_BY_CATEGORY[category];
            return (
              <section key={category}>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-2.5"
                  style={{ color: palette.hudMuted }}
                >
                  {SHIFT_CATEGORY_LABELS[category]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {items.map((item) => {
                    const active = enabledSet.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="switch"
                        aria-checked={active}
                        data-testid={`shift-toggle-${item.id}`}
                        onClick={() => toggleShift(item.id)}
                        className="min-h-[60px] text-left px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3"
                        style={{
                          backgroundColor: active
                            ? 'rgba(32, 28, 44, 0.055)'
                            : 'rgba(32, 28, 44, 0.015)',
                          borderColor: active
                            ? palette.hudAccent
                            : 'rgba(32, 28, 44, 0.12)',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold leading-snug">
                              {item.name}
                            </span>
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md font-mono-tabular"
                              style={{
                                backgroundColor: item.requiresBricks
                                  ? 'rgba(32, 28, 44, 0.08)'
                                  : 'rgba(32, 28, 44, 0.05)',
                                color: item.requiresBricks
                                  ? palette.hudMuted
                                  : palette.hudAccent,
                                border: item.requiresBricks
                                  ? '1px solid rgba(32, 28, 44, 0.1)'
                                  : `1px solid ${palette.hudAccent}`,
                              }}
                            >
                              {item.requiresBricks ? 'Needs Bricks' : 'Start-Ready'}
                            </span>
                          </div>
                          <div
                            className="text-[11px] leading-snug mt-1"
                            style={{ color: palette.hudMuted }}
                          >
                            {item.description}
                          </div>
                        </div>
                        <span
                          className="shrink-0 w-10 h-6 rounded-md flex items-center px-1 transition-colors mt-0.5"
                          style={{
                            backgroundColor: active
                              ? palette.hudAccent
                              : 'rgba(32, 28, 44, 0.18)',
                            justifyContent: active ? 'flex-end' : 'flex-start',
                          }}
                          aria-hidden="true"
                        >
                          <span className="w-4 h-4 rounded-sm bg-[#faf6ee]" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
};
