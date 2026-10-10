import React from 'react';
import { InspectionResult as InspectionResultType } from '../types';

interface InspectionResultProps {
  result: InspectionResultType | null;
  onReset?: () => void;
  isScanning?: boolean;
}

export const InspectionResult: React.FC<InspectionResultProps> = ({
  result,
  onReset,
  isScanning = false,
}) => {
  const isWaiting =
    !result ||
    !result.item_detected ||
    result.item_detected === 'None' ||
    result.correct_bin === 'Waiting for Item...' ||
    result.category === 'N/A';

  // 1. "No Object" / Waiting State Card
  if (isWaiting) {
    return (
      <div className="glass-panel box-neutral rounded-2xl p-5 sm:p-7 text-center max-w-2xl mx-auto w-full border border-slate-700/60 dark:border-slate-800 transition-all relative overflow-hidden">
        <div className="flex flex-col items-center justify-center py-5 sm:py-7">
          {/* Viewfinder Radar Animation */}
          <div className="relative mb-4 flex items-center justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-dashed border-emerald-500/50 dark:border-emerald-400/50 flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-500/5 animate-radar shadow-xl shadow-emerald-500/5">
              <span className="text-2xl sm:text-3xl">📷</span>
            </div>
            {/* Corner Bracket Accents */}
            <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400" />
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400" />
            <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400" />
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-2">
            <span>Waiting for waste item...</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {result?.action_required || 'Position an item clearly in front of the camera lens, then click "Inspect Waste Item" or speak a voice override.'}
          </p>

          <div className="mt-4 flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 px-3.5 py-1 rounded-full bg-slate-200/60 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <span>{isScanning ? 'Auditing with Bedrock...' : 'Ready for Inspection Snapshot'}</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Clear Object Detected -> Dynamic Open-Ended & E-Waste Rendering
  const isHazardousOrContaminated = result.is_contaminated || !result.is_segregation_correct;
  const isEWasteOrHazard =
    (result.category && result.category.toLowerCase().includes('e-waste')) ||
    (result.category && result.category.toLowerCase().includes('hazard')) ||
    (result.item_detected && result.item_detected.toLowerCase().includes('phone')) ||
    (result.item_detected && result.item_detected.toLowerCase().includes('battery'));

  const badgeColorClass = isEWasteOrHazard
    ? 'bg-amber-500/15 text-amber-500 dark:text-amber-300 border-amber-500/30'
    : isHazardousOrContaminated
    ? 'bg-rose-500/15 text-rose-500 dark:text-rose-300 border-rose-500/30'
    : 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-300 border-emerald-500/30';

  const confidencePct = Math.min(100, Math.max(0, Math.round(result.confidence_score * 100)));

  return (
    <div
      className={`glass-panel rounded-2xl p-5 sm:p-7 border-2 transition-all max-w-2xl mx-auto w-full relative overflow-hidden ${
        isHazardousOrContaminated ? 'box-red' : 'box-green'
      }`}
    >
      {/* Subtle top ambient glow */}
      <div
        className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
          isHazardousOrContaminated ? 'bg-rose-500/10' : 'bg-emerald-500/10'
        }`}
      />

      {/* Header Banner & Visual Hierarchy */}
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xl sm:text-2xl">
              {isEWasteOrHazard ? '⚡' : isHazardousOrContaminated ? '🛑' : '✅'}
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white break-words tracking-tight">
              {result.item_detected}
            </h3>

            {/* Category Pill */}
            <span
              className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold border shrink-0 uppercase tracking-wide ${badgeColorClass}`}
            >
              {result.category}
            </span>

            {/* Points Awarded / Risk Indicator */}
            <span
              className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0 border ${
                result.points_awarded > 0
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                  : result.points_awarded === 0
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30'
              }`}
            >
              {result.points_awarded > 0
                ? `+${result.points_awarded} Points Awarded`
                : result.points_awarded === 0
                ? '0 Pts (Special Stream)'
                : `${result.points_awarded} Points Risk`}
            </span>
          </div>

          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2 mt-1">
            <span>Assigned Bin:</span>
            <strong className="text-slate-900 dark:text-slate-100 font-bold bg-slate-100 dark:bg-slate-800/90 px-2.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-700/80 text-xs sm:text-sm">
              {result.correct_bin}
            </strong>
          </p>
        </div>

        {/* Confidence Gauge with Gradient Fill */}
        <div className="w-full sm:w-36 text-right shrink-0 bg-slate-50/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
            <span>Confidence</span>
            <span className="font-bold text-slate-900 dark:text-white">{confidencePct}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contamination Alert Detail Callout */}
      {result.contamination_reason && (
        <div
          className={`mt-4 p-3.5 sm:p-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-start gap-3 ${
            isEWasteOrHazard
              ? 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-sm shadow-amber-500/5'
              : 'bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/30 text-rose-900 dark:text-rose-200 shadow-sm shadow-rose-500/5'
          }`}
        >
          <span className="text-lg shrink-0 mt-0.5">⚠️</span>
          <div>
            <span className="font-bold uppercase tracking-wider text-[10px] block opacity-80">
              {isEWasteOrHazard ? 'Hazard Alert' : 'Contamination Detected'}
            </span>
            <p className="mt-0.5 leading-relaxed">{result.contamination_reason}</p>
          </div>
        </div>
      )}

      {/* AWS Cedar Statutory Policy Badge */}
      {result.cedar_statutory_citation && (
        <div className="mt-3.5 p-3 rounded-xl bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono shadow-sm">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 min-w-0 pr-2">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
              <span>🛡️</span> AWS Cedar:
            </span>
            <span className="truncate">{result.cedar_statutory_citation}</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
              result.cedar_decision === 'FORBID'
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 shadow-sm shadow-rose-500/10'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
            }`}
          >
            {result.cedar_decision || 'PERMIT'}
          </span>
        </div>
      )}

      {/* Action Required Banner */}
      <div
        className={`mt-4 p-3.5 sm:p-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-start gap-3 ${
          isHazardousOrContaminated
            ? 'bg-rose-600/10 dark:bg-rose-950/50 border-rose-500/40 text-rose-900 dark:text-rose-100'
            : 'bg-emerald-600/10 dark:bg-emerald-950/50 border-emerald-500/40 text-emerald-900 dark:text-emerald-100'
        }`}
      >
        <span className="text-lg shrink-0 mt-0.5">{isHazardousOrContaminated ? '🛑' : '👉'}</span>
        <div className="flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
            Required Protocol
          </span>
          <p className="mt-0.5 font-bold leading-relaxed">{result.action_required}</p>
        </div>
      </div>

      {/* Step-by-Step Remediation Checklist */}
      {result.remediation_steps && result.remediation_steps.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-slate-200/80 dark:border-slate-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 font-mono">
            Remediation Steps:
          </span>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            {result.remediation_steps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 hover:border-slate-700/60 transition-colors"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Environmental Impact Tip */}
      {result.environmental_impact_tip && (
        <div className="mt-3.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-800/80 pt-3 flex items-center gap-2">
          <span className="shrink-0 text-base">🌱</span>
          <span className="italic leading-relaxed">{result.environmental_impact_tip}</span>
        </div>
      )}

      {/* Reset & Scan Another Item Button */}
      {onReset && (
        <div className="mt-4 pt-3.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Scan ID: {result.scan_id || 'live_stream'}
          </span>
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>🔄</span>
            <span>Scan Another Item</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default InspectionResult;
