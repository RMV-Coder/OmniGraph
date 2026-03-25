import React from 'react';
import type { FlowTrace, FlowStepType } from '../../types';

const STEP_ICONS: Record<FlowStepType, string> = {
  caller: '\u{1F4C4}',       // page
  'http-call': '\u{1F310}',  // globe
  'route-handler': '\u{1F3AF}', // target
  dependency: '\u{1F517}',   // link
};

const STEP_COLORS: Record<FlowStepType, string> = {
  caller: '#4a90e8',
  'http-call': '#ff9800',
  'route-handler': '#7ed321',
  dependency: '#9b59b6',
};

interface Props {
  trace: FlowTrace;
  currentStepIndex: number;
  onStepForward: () => void;
  onStepBackward: () => void;
  onGoToStep: (index: number) => void;
  onStop: () => void;
  onOpenInApiClient: () => void;
}

export default function FlowTracerPanel({
  trace,
  currentStepIndex,
  onStepForward,
  onStepBackward,
  onGoToStep,
  onStop,
  onOpenInApiClient,
}: Props) {
  const navBtnStyle: React.CSSProperties = {
    flex: 1,
    background: '#1a1a2e',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '6px 0',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 13, color: '#fff', margin: 0 }}>
          Flow Trace
        </h3>
        <button
          onClick={onStop}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Edge info */}
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid #ff9800',
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 11,
          color: '#ff9800',
          fontWeight: 600,
        }}
      >
        {trace.steps.find(s => s.type === 'http-call')?.description ?? trace.edgeId}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          style={{
            ...navBtnStyle,
            opacity: currentStepIndex === 0 ? 0.4 : 1,
            cursor: currentStepIndex === 0 ? 'default' : 'pointer',
          }}
          onClick={onStepBackward}
          disabled={currentStepIndex === 0}
        >
          \u25C0 Back
        </button>
        <span
          style={{
            fontSize: 11,
            color: '#888',
            flexShrink: 0,
            textAlign: 'center',
            minWidth: 60,
          }}
        >
          {currentStepIndex + 1} / {trace.steps.length}
        </span>
        <button
          style={{
            ...navBtnStyle,
            opacity: currentStepIndex >= trace.steps.length - 1 ? 0.4 : 1,
            cursor: currentStepIndex >= trace.steps.length - 1 ? 'default' : 'pointer',
          }}
          onClick={onStepForward}
          disabled={currentStepIndex >= trace.steps.length - 1}
        >
          Next \u25B6
        </button>
      </div>

      {/* Step timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {trace.steps.map((step, i) => {
          const isCurrent = i === currentStepIndex;
          const color = STEP_COLORS[step.type];
          const icon = STEP_ICONS[step.type];

          return (
            <div key={i}>
              <div
                onClick={() => onGoToStep(i)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 4,
                  background: isCurrent ? `${color}15` : 'transparent',
                  border: isCurrent ? `1px solid ${color}` : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {/* Step indicator */}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: isCurrent ? color : '#222',
                    border: `2px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>

                {/* Step content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: isCurrent ? '#fff' : '#ccc',
                      fontWeight: isCurrent ? 700 : 400,
                    }}
                  >
                    {step.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: isCurrent ? color : '#666',
                      marginTop: 2,
                    }}
                  >
                    {step.description}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#555',
                      marginTop: 2,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {step.type.replace('-', ' ')}
                  </div>
                </div>
              </div>

              {/* Connector line between steps */}
              {i < trace.steps.length - 1 && (
                <div
                  style={{
                    width: 2,
                    height: 12,
                    background: '#333',
                    marginLeft: 21, // center of the 24px circle + 10px padding
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ borderTop: '1px solid #333', paddingTop: 8, display: 'flex', gap: 6 }}>
        <button
          onClick={onOpenInApiClient}
          style={{
            flex: 1,
            background: '#ff9800',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '6px 0',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open in API Client
        </button>
      </div>
    </div>
  );
}
