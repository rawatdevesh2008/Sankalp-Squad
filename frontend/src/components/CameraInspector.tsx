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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        setCameraError('Webcam unavailable or permission denied. You can still test using Upload Photo or Sample Presets below.');
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
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, 8);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
    ctx.stroke();

    // Badge Label Header
    const labelText = `${result.item_detected} • ${isGreen ? 'CLEAN (PASS)' : 'CONTAMINATED'}`;
    const fontSize = Math.max(12, Math.round(canvas.width * 0.022));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(labelText).width;
    const badgeHeight = fontSize + 12;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, Math.max(0, y - badgeHeight - 2), textWidth + 16, badgeHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + 8, Math.max(fontSize + 4, y - 8));
  }, []);

  // Core Inspection API Call
  const inspectImageBase64 = useCallback(
    async (imageBase64: string, customBin?: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const binToUse = customBin || targetBin;

      try {
        const res = await fetch(`${apiUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            target_bin: binToUse,
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
      } catch (err) {
        console.error('Failed to inspect frame:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [apiUrl, targetBin, userId, wardId, isProcessing, onInspectionResult, drawOverlay]
  );

  // 3. Capture Frame from Live Video and Dispatch to Backend
  const captureAndInspect = useCallback(async () => {
    if (previewImage) {
      inspectImageBase64(previewImage);
      return;
    }

    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.75);
      inspectImageBase64(imageBase64);
    }
  }, [previewImage, isProcessing, inspectImageBase64]);

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPreviewImage(b64);
      inspectImageBase64(b64);
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  // Helper to generate and inspect simulated sample waste items
  const handleSampleTest = (type: 'bottle' | 'pizza' | 'battery' | 'milk') => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    if (type === 'bottle') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(260, 100, 120, 280, 24);
      } else {
        ctx.rect(260, 100, 120, 280);
      }
      ctx.fill();
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(295, 70, 50, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Clean PET Water Bottle', 320, 240);
      setTargetBin('Dry Recyclable');
    } else if (type === 'pizza') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(180, 120, 280, 240);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(280, 220, 40, 0, Math.PI * 2);
      ctx.arc(360, 260, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Greasy Pizza Box', 320, 240);
      setTargetBin('Dry Recyclable'); // Test contamination detection in dry bin!
    } else if (type === 'battery') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(240, 160, 160, 160, 16);
      } else {
        ctx.rect(240, 160, 160, 160);
      }
      ctx.fill();
      ctx.fillStyle = '#eab308';
      ctx.fillRect(300, 140, 40, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Lithium Battery / Cable', 320, 240);
      setTargetBin('Dry Recyclable');
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(220, 120, 200, 240);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Unrinsed Milk Pouch', 320, 240);
      setTargetBin('Dry Recyclable');
    }

    const b64 = c.toDataURL('image/jpeg', 0.85);
    setPreviewImage(b64);
    inspectImageBase64(b64);
  };

  // 4. Enforce 2.5-Second Throttled Auto-Scan Loop (only if using live webcam)
  useEffect(() => {
    if (!autoScan || !isStreaming || previewImage) return;

    const interval = setInterval(() => {
      captureAndInspect();
    }, 2500); // 2.5 seconds throttle

    return () => clearInterval(interval);
  }, [autoScan, isStreaming, previewImage, captureAndInspect]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Viewport Frame */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl aspect-[4/3] max-w-2xl mx-auto w-full">
        {previewImage ? (
          <img
            src={previewImage}
            alt="Sample Frame"
            className="w-full h-full object-contain bg-slate-950"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

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
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isProcessing
                  ? 'bg-amber-400 animate-ping'
                  : previewImage
                  ? 'bg-cyan-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span>
              {isProcessing
                ? 'Auditing with Bedrock...'
                : previewImage
                ? 'Uploaded Frame Active'
                : 'Live Stream (2.5s interval)'}
            </span>
          </div>

          <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 text-xs text-slate-300">
            Scanning: <strong className="text-white">{targetBin}</strong>
          </div>
        </div>

        {/* Error Notification if camera unavailable and no preview */}
        {cameraError && !previewImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-slate-200 p-6 text-center z-30">
            <span className="text-4xl mb-2">📷</span>
            <p className="font-semibold text-rose-300 mb-2">{cameraError}</p>
            <p className="text-xs text-slate-400 mb-4">Click below to upload a photo or choose a sample waste item:</p>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg transition-all"
              >
                📁 Upload Photo
              </button>
              <button
                onClick={() => handleSampleTest('bottle')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-bold border border-slate-700"
              >
                🧴 Test Sample Bottle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controller Buttons */}
      <div className="glass-panel rounded-xl p-3 sm:p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-[11px] sm:text-xs text-slate-400 uppercase font-semibold shrink-0">Target Bin:</label>
            <select
              value={targetBin}
              onChange={(e) => setTargetBin(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white rounded-lg px-2.5 sm:px-3 py-1.5 focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
            >
              <option value="Dry Recyclable">Blue Bin (Dry Recyclable)</option>
              <option value="Wet Organic">Green Bin (Wet Organic)</option>
              <option value="Auto-Detect">Auto-Detect Stream</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {previewImage && isStreaming && (
              <button
                onClick={() => {
                  setPreviewImage(null);
                  const canvas = overlayCanvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx?.clearRect(0, 0, canvas.width, canvas.height);
                  }
                }}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-cyan-300 hover:bg-slate-700 border border-cyan-500/30 flex-1 sm:flex-initial"
              >
                📹 Live Camera
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>

            <button
              onClick={() => setAutoScan(!autoScan)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial ${
                autoScan && !previewImage
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {autoScan && !previewImage ? 'Auto-Scan: ON' : 'Auto-Scan: PAUSED'}
            </button>

            <button
              onClick={captureAndInspect}
              disabled={isProcessing}
              className="px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50 flex-1 sm:flex-initial"
            >
              {isProcessing ? 'Analyzing...' : 'Scan Now'}
            </button>
          </div>
        </div>

        {/* Quick Test Presets Row */}
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 font-semibold shrink-0">Quick Demo Samples:</span>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => handleSampleTest('bottle')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/60 border border-cyan-800/60 transition-all text-center truncate"
            >
              🧴 PET Bottle (Clean)
            </button>
            <button
              onClick={() => handleSampleTest('pizza')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-amber-950/60 text-amber-300 hover:bg-amber-900/60 border border-amber-800/60 transition-all text-center truncate"
            >
              🍕 Greasy Pizza Box
            </button>
            <button
              onClick={() => handleSampleTest('milk')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-blue-950/60 text-blue-300 hover:bg-blue-900/60 border border-blue-800/60 transition-all text-center truncate"
            >
              🥛 Milk Pouch (Dirty)
            </button>
            <button
              onClick={() => handleSampleTest('battery')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-rose-950/60 text-rose-300 hover:bg-rose-900/60 border border-rose-800/60 transition-all text-center truncate"
            >
              🔋 Battery (Hazard)
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Advice & Remediation Card */}
      {lastResult && (
        <div
          className={`glass-panel rounded-2xl p-4 sm:p-5 border-2 transition-all max-w-2xl mx-auto w-full ${
            lastResult.box_color === 'green' ? 'box-green' : 'box-red'
          }`}
        >
          <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl sm:text-2xl">{lastResult.box_color === 'green' ? '🟢' : '🔴'}</span>
                <h4 className="text-lg sm:text-xl font-bold text-white break-words">{lastResult.item_detected}</h4>
                <span
                  className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0 ${
                    lastResult.box_color === 'green'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {lastResult.box_color === 'green' ? '+15 Points' : '-5 Points Risk'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-1 font-mono">
                Prescribed Disposal: <strong className="text-slate-200">{lastResult.correct_bin}</strong>
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] sm:text-xs font-mono text-slate-400">Confidence</span>
              <p className="text-base sm:text-lg font-bold text-white font-mono">
                {(lastResult.confidence_score * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Action Required Banner */}
          <div
            className={`mt-3.5 sm:mt-4 p-3 sm:p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 ${
              lastResult.box_color === 'green'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
            }`}
          >
            <span className="text-base shrink-0">👉</span>
            <span>{lastResult.action_required}</span>
          </div>

          {/* Contamination reason if present */}
          {lastResult.contamination_reason && (
            <p className="text-[11px] sm:text-xs text-rose-300/90 mt-2.5 italic">
              ⚠️ Reason: {lastResult.contamination_reason}
            </p>
          )}

          {/* Eco Tip */}
          {lastResult.environmental_impact_tip && (
            <div className="mt-3 text-[11px] sm:text-xs text-slate-400 border-t border-slate-800/80 pt-2 flex items-center gap-1.5">
              <span className="shrink-0">🌱</span>
              <span>{lastResult.environmental_impact_tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
