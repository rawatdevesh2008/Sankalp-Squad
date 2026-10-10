import React from 'react';
import { UserScore } from '../types';

interface ScoreBoardProps {
  score: UserScore | null;
  isLoading: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ score, isLoading }) => {
  if (!score) {
    return (
      <div className="glass-panel rounded-2xl p-5 sm:p-6 text-center border border-slate-200 dark:border-slate-800/80">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/40 border-t-emerald-400 animate-spin mx-auto mb-2" />
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium">Syncing Household Telemetry...</p>
      </div>
    );
  }

  const accuracy = Math.min(100, Math.max(0, score.segregation_accuracy_pct));

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-xl border border-slate-200 dark:border-slate-800/70 relative overflow-hidden group">
      {/* Subtle background ambient glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">🏆</span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Household Leaderboard
            </h3>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
            <span>ID:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{score.user_id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shrink-0 shadow-sm shadow-emerald-500/5">
            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 ${isLoading ? 'animate-ping' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'DynamoDB Live'}</span>
          </span>
        </div>
      </div>

      {/* 2-Column Metrics Cards with Micro-Interactions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {/* Metric 1: Segregation Accuracy */}
        <div className="bg-slate-50/80 dark:bg-slate-900/60 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:border-cyan-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Accuracy Rate
              </span>
              <span className="text-xs">🎯</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-cyan-500 to-teal-400 bg-clip-text text-transparent mt-1.5 font-mono tracking-tight">
              {score.segregation_accuracy_pct}%
            </p>
          </div>

          <div className="mt-3">
            {/* Visual Progress Bar Gauge */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${accuracy}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-1.5 font-mono">
              {score.correct_scans} of {score.total_scans} verified clean
            </span>
          </div>
        </div>

        {/* Metric 2: Contamination Prevented */}
        <div className="bg-slate-50/80 dark:bg-slate-900/60 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:border-rose-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Contamination Stopped
              </span>
              <span className="text-xs">🛑</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent mt-1.5 font-mono tracking-tight">
              {score.contamination_prevented}
            </p>
          </div>

          <div className="mt-3">
            {/* Progress track */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, score.contamination_prevented * 10)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-1.5 font-mono">
              Cross-contamination alerts averted
            </span>
          </div>
        </div>
      </div>

      {/* Footer Meta Row */}
      <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 font-mono">
        <span className="truncate">Sankalp Squad • Bharat Builds Tour</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
          ● Scoreboard Active
        </span>
      </div>
    </div>
  );
};

export default ScoreBoard;
