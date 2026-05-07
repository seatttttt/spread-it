'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import type { WalletNode, SpreadEdge, FeedEvent } from '../types/spread';
import { truncateAddress } from '../lib/format';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
  id: string;
  rScore: number;
  status: WalletNode['status'];
  spreadCount: number;
  currentBalance: number;
  peakBalance: number;
  isPatientZero: boolean;
  isQuarantined: boolean;
  isDormant: boolean;
  size: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [others: string]: unknown;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  signature: string;
  observedAt: string;
  amountTokens: number;
  [others: string]: unknown;
}

interface InfectionTreeProps {
  nodes: WalletNode[];
  spreads: SpreadEdge[];
  lastEvent: FeedEvent | null;
  onSelectNode?: (wallet: string | null) => void;
  selectedWallet?: string | null;
}

const COLOR = {
  patientZero: '#ca8a04',
  patientZeroGlow: '#facc15',
  active: '#facc15',
  activeGlow: '#fde047',
  quarantined: '#dc2626',
  dormant: '#a3a399',
  dormantStroke: '#d4d4d0',
  text: '#1a1a1a',
  edge: '#ca8a04',
  edgeFlash: '#facc15',
};

export function InfectionTree({
  nodes,
  spreads,
  lastEvent,
  onSelectNode,
  selectedWallet,
}: InfectionTreeProps) {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [edgeFlashes, setEdgeFlashes] = useState<Map<string, number>>(new Map());

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Resize observer for responsive canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) {
      const isPZ = n.status === 'patient_zero';
      const isQuarantined = n.status === 'quarantined';
      const isDormant = n.rScore === 0 && !isPZ && !isQuarantined;
      const baseSize = isPZ ? 14 : Math.sqrt(Math.max(1, n.rScore)) * 5 + 4;
      nodeMap.set(n.wallet, {
        id: n.wallet,
        rScore: n.rScore,
        status: n.status,
        spreadCount: n.spreadCount,
        currentBalance: n.currentBalance,
        peakBalance: n.peakBalance,
        isPatientZero: isPZ,
        isQuarantined,
        isDormant,
        size: baseSize,
      });
    }
    // Pin Patient Zero near origin (force layout will adjust around it).
    for (const node of nodeMap.values()) {
      if (node.isPatientZero) {
        node.fx = 0;
        node.fy = 0;
      }
    }

    // Ensure every spread participant exists as a node (defensive).
    for (const s of spreads) {
      if (!nodeMap.has(s.sender)) {
        nodeMap.set(s.sender, {
          id: s.sender,
          rScore: 0,
          status: 'active',
          spreadCount: 0,
          currentBalance: 0,
          peakBalance: 0,
          isPatientZero: false,
          isQuarantined: false,
          isDormant: true,
          size: 4,
        });
      }
      if (!nodeMap.has(s.recipient)) {
        nodeMap.set(s.recipient, {
          id: s.recipient,
          rScore: 0,
          status: 'active',
          spreadCount: 0,
          currentBalance: 0,
          peakBalance: 0,
          isPatientZero: false,
          isQuarantined: false,
          isDormant: true,
          size: 4,
        });
      }
    }

    const links: GraphLink[] = spreads.map((s) => ({
      source: s.sender,
      target: s.recipient,
      signature: `${s.signature}:${s.logIndex}`,
      observedAt: s.observedAt,
      amountTokens: s.amountTokens,
    }));

    return { nodes: Array.from(nodeMap.values()), links };
  }, [nodes, spreads]);

  // Track new spreads → flash their edge briefly
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'spread' || !lastEvent.data.valid) return;
    const key = `${lastEvent.data.signature}:${lastEvent.data.logIndex}`;
    const startedAt = Date.now();
    setEdgeFlashes((prev) => {
      const next = new Map(prev);
      next.set(key, startedAt);
      return next;
    });
    const t = setTimeout(() => {
      setEdgeFlashes((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [lastEvent]);

  // Force redraw at 24fps to keep flashes animating
  useEffect(() => {
    if (edgeFlashes.size === 0) return;
    const id = setInterval(() => {
      // Force a refresh of edge colors by spreading the map (no-op set)
      setEdgeFlashes((m) => new Map(m));
    }, 60);
    return () => clearInterval(id);
  }, [edgeFlashes.size]);

  // Initial zoom + center
  useEffect(() => {
    if (!fgRef.current) return;
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit(800, 80);
    }, 300);
    return () => clearTimeout(t);
  }, [size.w, size.h]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph2D
        ref={fgRef as never}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(250, 250, 247, 0)"
        nodeRelSize={4}
        cooldownTicks={120}
        d3VelocityDecay={0.35}
        linkDirectionalParticles={0}
        linkWidth={(link) => {
          const flash = edgeFlashes.get((link as GraphLink).signature);
          if (flash) return 2.5;
          return 1;
        }}
        linkColor={(link) => {
          const flash = edgeFlashes.get((link as GraphLink).signature);
          if (flash) {
            const elapsed = (Date.now() - flash) / 1200;
            const alpha = Math.max(0, 1 - elapsed);
            return `rgba(250, 204, 21, ${alpha.toFixed(2)})`;
          }
          return 'rgba(202, 138, 4, 0.35)';
        }}
        nodeLabel={(node) => {
          const n = node as GraphNode;
          return `<div style="font-family:monospace;font-size:11px;background:#fff;color:#1a1a1a;padding:6px 8px;border:1px solid #d4d4d0;">
            ${truncateAddress(n.id, 6)}<br/>
            R = ${n.rScore} · ${n.status.toUpperCase()}
          </div>`;
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as GraphNode;
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          const r = n.size;
          const isHover = hoveredId === n.id;
          const isSelected = selectedWallet === n.id;

          // Outer glow for selected/hover
          if (isSelected || isHover) {
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
            ctx.fillStyle = n.isPatientZero
              ? 'rgba(250, 204, 21, 0.18)'
              : n.isQuarantined
                ? 'rgba(220, 38, 38, 0.18)'
                : 'rgba(250, 204, 21, 0.18)';
            ctx.fill();
          }

          // Patient Zero: concentric pulse
          if (n.isPatientZero) {
            const pulseR = r + 4 + Math.sin(Date.now() / 600) * 2;
            ctx.beginPath();
            ctx.arc(x, y, pulseR, 0, 2 * Math.PI);
            ctx.strokeStyle = COLOR.patientZeroGlow;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Node body
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          if (n.isPatientZero) {
            ctx.fillStyle = COLOR.patientZero;
          } else if (n.isQuarantined) {
            ctx.fillStyle = COLOR.quarantined;
          } else if (n.isDormant) {
            ctx.fillStyle = COLOR.dormant;
          } else {
            ctx.fillStyle = COLOR.active;
          }
          ctx.fill();

          // Stroke
          ctx.lineWidth = n.isPatientZero ? 2 : 1;
          ctx.strokeStyle = n.isDormant ? COLOR.dormantStroke : '#1a1a1a';
          ctx.stroke();

          // R-score label (only if visible at this zoom + r > 0)
          if (n.rScore > 0 && globalScale > 1) {
            ctx.font = `${10 / globalScale}px ui-monospace, JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = n.isPatientZero ? '#1a1a1a' : '#1a1a1a';
            ctx.fillText(String(n.rScore), x, y);
          }
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GraphNode;
          const r = n.size + 4;
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
        onNodeHover={(node) => {
          setHoveredId((node as GraphNode | null)?.id ?? null);
          if (typeof document !== 'undefined') {
            document.body.style.cursor = node ? 'pointer' : 'default';
          }
        }}
        onNodeClick={(node) => {
          const id = (node as GraphNode).id;
          if (onSelectNode) onSelectNode(id === selectedWallet ? null : id);
        }}
        onBackgroundClick={() => {
          if (onSelectNode) onSelectNode(null);
        }}
      />

      {/* Legend overlay */}
      <div className="absolute left-4 bottom-4 bg-bg-elevated/85 backdrop-blur-sm border border-border-subtle px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-text-secondary space-y-1 select-none">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.patientZero, border: '1px solid #1a1a1a' }} />
          <span>Patient Zero</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.active, border: '1px solid #1a1a1a' }} />
          <span>Active carrier</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.dormant, border: '1px solid #d4d4d0' }} />
          <span>Dormant holder</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.quarantined, border: '1px solid #1a1a1a' }} />
          <span>Quarantined</span>
        </div>
      </div>
    </div>
  );
}
