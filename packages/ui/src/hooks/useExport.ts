import { useCallback } from 'react';
import { useReactFlow, getRectOfNodes } from 'reactflow';
import { toPng, toSvg } from 'html-to-image';
import type { OmniGraph } from '../types';

/** Padding (px) added around the exported image */
const IMAGE_PADDING = 50;

/** Find the React Flow viewport DOM element */
function getViewportElement(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport') as HTMLElement | null;
}

export function useExport(graphData: OmniGraph | null) {
  /** Download a blob/data-URL as a file */
  const downloadFile = useCallback((dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  /** Export graph as PNG */
  const exportPng = useCallback(async () => {
    const el = getViewportElement();
    if (!el) return;

    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#1a1a2e',
        pixelRatio: 2,
        filter: (node) => {
          // Exclude the minimap and controls from the export
          const classes = (node as HTMLElement).classList;
          if (!classes) return true;
          return (
            !classes.contains('react-flow__minimap') &&
            !classes.contains('react-flow__controls')
          );
        },
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
        filter: (node) => {
          const classes = (node as HTMLElement).classList;
          if (!classes) return true;
          return (
            !classes.contains('react-flow__minimap') &&
            !classes.contains('react-flow__controls')
          );
        },
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

  return { exportPng, exportSvg, exportJson };
}
