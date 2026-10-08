import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InspectionResponse } from '../types';

interface CameraInspectorProps {
  apiUrl: string;
  onInspectionResult: (result: InspectionResponse) => void;
  userId: string;
  wardId: string;
}

export const CameraInspector: React.FC<CameraInspectorProps> = ({
  apiUrl,
  onInspectionResult,
  userId,
  wardId,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [targetBin, setTargetBin] = useState('Dry Recyclable');
  const [autoScan, setAutoScan] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<InspectionResponse | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // 1. Initialize Webcam
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setIsStreaming(true);
          setCameraError(null);
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError('Unable to access camera. Please allow webcam permissions.');
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. Draw Green / Red Bounding Box on Overlay Canvas
  const drawOverlay = useCallback((result: InspectionResponse) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { ymin, xmin, ymax, xmax } = result.bounding_box;
    const x = (xmin / 1000) * canvas.width;
    const y = (ymin / 1000) * canvas.height;
    const width = ((xmax - xmin) / 1000) * canvas.width;
    const height = ((ymax - ymin) / 1000) * canvas.height;

    const isGreen = result.box_color === 'green';
    const strokeColor = isGreen ? '#22c55e' : '#ef4444';
    const fillColor = isGreen ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    // Bounding Box
    ctx.lineWidth = 4;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Badge Label Header
    const labelText = `${result.item_detected} • ${isGreen ? 'CLEAN (PASS)' : 'CONTAMINATED'}`;
    ctx.font = 'bold 14px monospace';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, Math.max(0, y - 28), textWidth + 16, 26);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + 8, Math.max(18, y - 10));
  }, []);

  // 3. Capture Frame and Dispatch to Backend
  const captureAndInspect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsProcessing(true);

    try {
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.75);

        // Send to FastAPI Backend
        const res = await fetch(`${apiUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            target_bin: targetBin,
            user_id: userId,
            ward_id: wardId,
            location_context: 'India - Municipal',
          }),
        });

        if (res.ok) {
          const data: InspectionResponse = await res.json();
          setLastResult(data);
          onInspectionResult(data);
          drawOverlay(data);
        } else {
          console.error('Inspection API returned status:', res.status);
        }
      }
    } catch (err) {
      console.error('Failed to inspect frame:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [apiUrl, targetBin, userId, wardId, isProcessing, onInspectionResult, drawOverlay]);

  // 4. Enforce 2.5-Second Throttled Auto-Scan Loop
  useEffect(() => {
    if (!autoScan || !isStreaming) return;

    const interval = setInterval(() => {
      captureAndInspect();
    }, 2500); // 2.5 seconds throttle

    return () => clearInterval(interval);
  }, [autoScan, isStreaming, captureAndInspect]);

  return (
    <div className="flex flex-col gap-4">
      {/* Viewport Frame */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl aspect-[4/3] max-w-2xl mx-auto w-full">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Bounding Box Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Status Bar Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 text-xs text-white">
            <span className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
            <span>{isProcessing ? 'Auditing with Bedrock...' : 'Live Stream (2.5s interval)'}</span>
          </div>

          <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 text-xs text-slate-300">
            Scanning: <strong className="text-white">{targetBin}</strong>
          </div>
        </div>

        {/* Error Notification */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-rose-400 p-6 text-center z-30">
            <p className="font-semibold">{cameraError}</p>
          </div>
        )}
      </div>

      {/* Controller Buttons */}
      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 max-w-2xl mx-auto w-full border border-slate-800">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase font-semibold">Target Bin:</label>
          <select
            value={targetBin}
            onChange={(e) => setTargetBin(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="Dry Recyclable">Blue Bin (Dry Recyclable)</option>
            <option value="Wet Organic">Green Bin (Wet Organic)</option>
            <option value="Auto-Detect">Auto-Detect Stream</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoScan(!autoScan)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              autoScan
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {autoScan ? 'Auto-Scan: ON' : 'Auto-Scan: PAUSED'}
          </button>

          <button
            onClick={captureAndInspect}
            disabled={isProcessing}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50"
          >
            {isProcessing ? 'Analyzing...' : 'Scan Now'}
          </button>
        </div>
      </div>

      {/* Real-time Advice & Remediation Card */}
      {lastResult && (
        <div
          className={`glass-panel rounded-2xl p-5 border-2 transition-all max-w-2xl mx-auto w-full ${
            lastResult.box_color === 'green' ? 'box-green' : 'box-red'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{lastResult.box_color === 'green' ? '🟢' : '🔴'}</span>
                <h4 className="text-xl font-bold text-white">{lastResult.item_detected}</h4>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    lastResult.box_color === 'green'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {lastResult.box_color === 'green' ? '+15 Points' : '-5 Points Risk'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Prescribed Disposal: <strong className="text-slate-200">{lastResult.correct_bin}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">Confidence</span>
              <p className="text-lg font-bold text-white font-mono">
                {(lastResult.confidence_score * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Action Required Banner */}
          <div
            className={`mt-4 p-3.5 rounded-xl border text-sm font-semibold flex items-center gap-2.5 ${
              lastResult.box_color === 'green'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
            }`}
          >
            <span>👉</span>
            <span>{lastResult.action_required}</span>
          </div>

          {/* Contamination reason if present */}
          {lastResult.contamination_reason && (
            <p className="text-xs text-rose-300/90 mt-2.5 italic">
              ⚠️ Reason: {lastResult.contamination_reason}
            </p>
          )}

          {/* Eco Tip */}
          {lastResult.environmental_impact_tip && (
            <div className="mt-3 text-xs text-slate-400 border-t border-slate-800/80 pt-2 flex items-center gap-1.5">
              <span>🌱</span>
              <span>{lastResult.environmental_impact_tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
