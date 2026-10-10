import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InspectionResponse } from '../types';
import { InspectionResult } from './InspectionResult';

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

    // If No Object is detected, do not draw bounding box overlay
    const isNoObject =
      !result.item_detected ||
      result.item_detected === 'None' ||
      result.correct_bin === 'Waiting for Item...' ||
      result.category === 'N/A';

    if (isNoObject) {
      return;
    }

    const { ymin, xmin, ymax, xmax } = result.bounding_box || { ymin: 0, xmin: 0, ymax: 0, xmax: 0 };
    if (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) {
      return;
    }

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
    const labelText = `${result.item_detected} • ${isGreen ? 'CLEAN (PASS)' : 'CONTAMINATED / HAZARD'}`;
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

  // 3. Reset / Scan Another Item Handler
  const handleReset = useCallback(() => {
    setLastResult(null);
    setPreviewImage(null);
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Capture Frame from Live Video and Dispatch to Backend
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
  const handleSampleTest = (type: 'bottle' | 'pizza' | 'phone' | 'battery' | 'milk' | 'empty') => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    if (type === 'phone') {
      // Draw simulated Mobile Phone (E-Waste / Hazardous)
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 640, 480);
      // Phone Body
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(240, 90, 160, 300, 24);
      } else {
        ctx.rect(240, 90, 160, 300);
      }
      ctx.fill();
      // Phone Screen
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(248, 105, 144, 270, 14);
      } else {
        ctx.rect(248, 105, 144, 270);
      }
      ctx.fill();
      // Camera bump
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(268, 125, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Smartphone', 320, 240);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Lithium Battery inside', 320, 265);
      setTargetBin('Dry Recyclable');
    } else if (type === 'bottle') {
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
      setTargetBin('Dry Recyclable');
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
    } else if (type === 'milk') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(220, 120, 200, 240);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Unrinsed Milk Pouch', 320, 240);
      setTargetBin('Dry Recyclable');
    } else {
      // Empty / No Object scenario
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#334155';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('[Empty Viewfinder Frame - No Item]', 320, 240);
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
    }, 2500);

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
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 dark:bg-slate-950 border-2 border-slate-700/60 dark:border-slate-800 shadow-2xl aspect-[4/3] max-w-2xl mx-auto w-full transition-all">
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
            Target Bin: <strong className="text-white">{targetBin}</strong>
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
                🧴 Test Bottle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controller Buttons */}
      <div className="glass-panel rounded-xl p-3 sm:p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full border border-slate-200 dark:border-slate-800 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold shrink-0">
              Target Bin:
            </label>
            <select
              value={targetBin}
              onChange={(e) => setTargetBin(e.target.value)}
              className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white rounded-lg px-2.5 sm:px-3 py-1.5 focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
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
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-cyan-500/30 flex-1 sm:flex-initial cursor-pointer"
              >
                📹 Live Camera
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>

            <button
              onClick={() => setAutoScan(!autoScan)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial cursor-pointer ${
                autoScan && !previewImage
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {autoScan && !previewImage ? 'Auto-Scan: ON' : 'Auto-Scan: PAUSED'}
            </button>

            <button
              onClick={captureAndInspect}
              disabled={isProcessing}
              className="px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 flex-1 sm:flex-initial cursor-pointer"
            >
              {isProcessing ? 'Analyzing...' : 'Scan Now'}
            </button>
          </div>
        </div>

        {/* Quick Test Presets Row */}
        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold shrink-0">
            Quick Test Presets:
          </span>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => handleSampleTest('phone')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-all text-center truncate cursor-pointer font-semibold"
            >
              📱 Mobile Phone (E-Waste)
            </button>
            <button
              onClick={() => handleSampleTest('bottle')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all text-center truncate cursor-pointer"
            >
              🧴 PET Bottle (Clean)
            </button>
            <button
              onClick={() => handleSampleTest('pizza')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 transition-all text-center truncate cursor-pointer"
            >
              🍕 Greasy Pizza Box
            </button>
            <button
              onClick={() => handleSampleTest('empty')}
              disabled={isProcessing}
              className="px-2 sm:px-2.5 py-1 text-[11px] rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all text-center truncate cursor-pointer"
            >
              ⚪ Empty (Waiting Test)
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Advice & Remediation Card (Dedicated InspectionResult Component) */}
      <InspectionResult
        result={lastResult}
        onReset={handleReset}
        isScanning={isProcessing}
      />
    </div>
  );
};

export default CameraInspector;
