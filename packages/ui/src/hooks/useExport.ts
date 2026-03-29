import { useCallback, useRef, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { toPng, toSvg } from 'html-to-image';
import GIF from 'gif.js';
import type { OmniGraph } from '../types';

/** Padding (px) added around the exported image */
const IMAGE_PADDING = 50;

/**
 * GIF settings
 * React Flow's dashdraw animation: stroke-dasharray: 5, stroke-dashoffset: 10 → 0
 * One full animation cycle = dashoffset goes from 10 to 0 (10 units of movement).
 * We capture exactly 1 cycle at 30fps over 1 second.
 */
const GIF_DURATION_MS = 1000;
const GIF_FPS = 30;
const GIF_FRAME_COUNT = (GIF_DURATION_MS / 1000) * GIF_FPS; // 30 frames
const GIF_FRAME_DELAY = Math.round(1000 / GIF_FPS);         // ~33ms per frame
const GIF_PIXEL_RATIO = 2;

/** The dashoffset animation cycle length (React Flow uses 10) */
const DASH_CYCLE = 10;

/** GIF export progress state */
export interface GifExportProgress {
  active: boolean;
  phase: 'capturing' | 'encoding' | 'idle';
  /** 0–100 overall percentage */
  percent: number;
  /** Human-readable status text */
  message: string;
}

const IDLE_PROGRESS: GifExportProgress = {
  active: false,
  phase: 'idle',
  percent: 0,
  message: '',
};

/** Find the React Flow viewport DOM element */
function getViewportElement(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport') as HTMLElement | null;
}

/** Standard filter to exclude minimap and controls from export */
function exportFilter(node: HTMLElement): boolean {
  const classes = node.classList;
  if (!classes) return true;
  return (
    !classes.contains('react-flow__minimap') &&
    !classes.contains('react-flow__controls')
  );
}

/** Load an image from a data URL and return it as an HTMLImageElement */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Get all animated edge path elements in the viewport.
 * These are <path> elements inside .react-flow__edge.animated
 * (excluding the invisible interaction paths).
 */
function getAnimatedPaths(): SVGPathElement[] {
  return Array.from(
    document.querySelectorAll<SVGPathElement>(
      '.react-flow__edge.animated path:not(.react-flow__edge-interaction)'
    )
  );
}

export function useExport(graphData: OmniGraph | null) {
  const gifExporting = useRef(false);
  const [gifProgress, setGifProgress] = useState<GifExportProgress>(IDLE_PROGRESS);

  /** Download a blob/data-URL as a file */
  const downloadFile = useCallback((dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  /** Download a Blob as a file */
  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  /** Export graph as PNG */
  const exportPng = useCallback(async () => {
    const el = getViewportElement();
    if (!el) return;

    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#1a1a2e',
        pixelRatio: 2,
        filter: exportFilter,
      });
      downloadFile(dataUrl, 'omnigraph.png');
    } catch (err) {
      console.error('PNG export failed:', err);
    }
  }, [downloadFile]);

  /** Export graph as SVG */
  const exportSvg = useCallback(async () => {
    const el = getViewportElement();
    if (!el) return;

    try {
      const dataUrl = await toSvg(el, {
        backgroundColor: '#1a1a2e',
        filter: exportFilter,
      });
      downloadFile(dataUrl, 'omnigraph.svg');
    } catch (err) {
      console.error('SVG export failed:', err);
    }
  }, [downloadFile]);

  /** Export graph data as JSON */
  const exportJson = useCallback(() => {
    if (!graphData) return;
    const json = JSON.stringify(graphData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, 'omnigraph.json');
    URL.revokeObjectURL(url);
  }, [graphData, downloadFile]);

  /**
   * Export graph as animated GIF (1 second, 30fps, looping).
   *
   * The approach: html-to-image clones the DOM, which resets CSS animations,
   * so every frame would look identical. Instead, we:
   * 1. Pause the CSS animation on all animated edge paths
   * 2. Manually set stroke-dashoffset for each frame to simulate the motion
   * 3. Capture each frame with html-to-image at 2x DPI
   * 4. Restore the CSS animation when done
   */
  const exportGif = useCallback(async () => {
    const el = getViewportElement();
    if (!el || gifExporting.current) return;

    gifExporting.current = true;
    setGifProgress({
      active: true,
      phase: 'capturing',
      percent: 0,
      message: 'Preparing frames...',
    });

    // Inject a style to pause CSS animations and let us control dashoffset manually
    const pauseStyle = document.createElement('style');
    pauseStyle.textContent = `
      .react-flow__edge.animated path {
        animation: none !important;
      }
    `;
    document.head.appendChild(pauseStyle);

    const paths = getAnimatedPaths();

    try {
      // Set initial dashoffset
      for (const p of paths) {
        p.style.strokeDasharray = '5';
        p.style.strokeDashoffset = String(DASH_CYCLE);
      }

      const firstDataUrl = await toPng(el, {
        backgroundColor: '#1a1a2e',
        pixelRatio: GIF_PIXEL_RATIO,
        filter: exportFilter,
      });
      const firstImg = await loadImage(firstDataUrl);
      const width = firstImg.naturalWidth;
      const height = firstImg.naturalHeight;

      const gif = new GIF({
        workers: 4,
        quality: 1,
        width,
        height,
        workerScript: '/gif.worker.js',
        repeat: 0,
        dither: false,
      });

      // Capture phase — 0% to 60% of overall progress
      for (let i = 0; i < GIF_FRAME_COUNT; i++) {
        const progress = i / GIF_FRAME_COUNT;
        const offset = DASH_CYCLE * (1 - progress);

        for (const p of paths) {
          p.style.strokeDashoffset = String(offset);
        }

        // Let the browser repaint before capture
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const capturePercent = Math.round((i / GIF_FRAME_COUNT) * 60);
        setGifProgress({
          active: true,
          phase: 'capturing',
          percent: capturePercent,
          message: `Capturing frame ${i + 1} of ${GIF_FRAME_COUNT}`,
        });

        const dataUrl = await toPng(el, {
          backgroundColor: '#1a1a2e',
          pixelRatio: GIF_PIXEL_RATIO,
          filter: exportFilter,
        });

        const img = await loadImage(dataUrl);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        gif.addFrame(ctx, { delay: GIF_FRAME_DELAY, copy: true });
      }

      // Encoding phase — 60% to 100%
      setGifProgress({
        active: true,
        phase: 'encoding',
        percent: 60,
        message: 'Encoding GIF...',
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        gif.on('progress', (p: number) => {
          const encodePercent = 60 + Math.round(p * 40);
          setGifProgress({
            active: true,
            phase: 'encoding',
            percent: encodePercent,
            message: `Encoding GIF... ${Math.round(p * 100)}%`,
          });
        });
        gif.on('finished', (blob: Blob) => resolve(blob));
        gif.on('abort', () => reject(new Error('GIF rendering aborted')));
        gif.render();
      });

      downloadBlob(blob, 'omnigraph.gif');
    } catch (err) {
      console.error('GIF export failed:', err);
    } finally {
      // Restore: remove inline styles and re-enable CSS animation
      for (const p of paths) {
        p.style.strokeDasharray = '';
        p.style.strokeDashoffset = '';
      }
      document.head.removeChild(pauseStyle);
      gifExporting.current = false;
      setGifProgress(IDLE_PROGRESS);
    }
  }, [downloadBlob]);

  return { exportPng, exportSvg, exportJson, exportGif, gifProgress };
}
