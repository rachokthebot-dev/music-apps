"use client";

/**
 * Signal-chain visualization for the active master + current snapshot.
 *
 * Uses React Flow for the graph + dagre for hierarchical (LR) layout. Nodes
 * are static (no drag) but pan + zoom remain. Topology is derived from each
 * block's @path + @position: blocks on path 0 form the spine, blocks on path 1
 * branch off between virtual SPLIT and JOIN nodes.
 *
 * Per-block visual state is computed from:
 *   master defaults ← snapshot overrides ← pending changes
 * Pending changes are highlighted in rose (param) or with "←" (enable toggle).
 */

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import dagre from "dagre";

import "@xyflow/react/dist/style.css";
import { iconForCategory, colorForCategory } from "./helixIcons";

// ---------------------------------------------------------------------------
// Types (mirror the page's expected shapes — kept local so the component is
// self-contained)
// ---------------------------------------------------------------------------

export type ChainBlock = {
  dsp: string;
  slot: string;
  model: string;
  friendly: string;
  category: string | null;
  basedOn?: string;
  defaults: { [param: string]: number };
  /** Raw @path/@position from the master, used to derive topology */
  path?: number;
  position?: number;
};

export type SnapshotState = {
  index: number;
  name: string;
  blocks: { [slotPath: string]: boolean };
  params: { [slotPath: string]: { [param: string]: number } };
};

export type PendingBlock = { enabled?: boolean; params?: { [param: string]: number } };
export type PendingPerSnap = { [friendlyBlock: string]: PendingBlock };

type Props = {
  chain: ChainBlock[];
  snapshot: SnapshotState | undefined;
  snapshotPending: PendingPerSnap;
};

// ---------------------------------------------------------------------------
// Custom block node
// ---------------------------------------------------------------------------

type BlockNodeData = {
  block: ChainBlock;
  enabled: boolean;
  enabledChanged: boolean;
  paramRows: Array<{
    name: string;
    display: number | undefined;
    base: number | undefined;
    changed: boolean;
  }>;
};

function BlockNode({ data }: { data: BlockNodeData }) {
  const { block, enabled, enabledChanged, paramRows } = data;
  const Icon = iconForCategory(block.category);
  const color = colorForCategory(block.category);

  return (
    <div
      className={`rounded-md border px-2 py-1.5 w-[160px] shadow-md ${
        enabled
          ? "border-zinc-700 bg-zinc-900"
          : "border-zinc-900 bg-zinc-950/80 opacity-60"
      }`}
      style={enabled ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className="shrink-0 rounded p-0.5 flex items-center justify-center"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-zinc-100 truncate leading-tight">
              {block.friendly}
            </div>
            {block.basedOn && (
              <div className="text-[9px] text-zinc-500 truncate leading-tight">
                {block.basedOn}
              </div>
            )}
          </div>
        </div>
        <div
          className={`text-[8px] uppercase tracking-wider px-1 py-0.5 rounded shrink-0 ${
            enabledChanged
              ? "bg-rose-900/50 text-rose-300 border border-rose-700/50"
              : enabled
                ? "bg-emerald-900/50 text-emerald-300 border border-emerald-800/50"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700"
          }`}
          title={enabledChanged ? "Enable state changed" : enabled ? "on" : "bypassed"}
        >
          {enabled ? "on" : "off"}
          {enabledChanged && "←"}
        </div>
      </div>
      {paramRows.length > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-x-1.5 gap-y-0">
          {paramRows.map((p) => (
            <div key={p.name} className="text-[10px] flex items-baseline justify-between gap-1">
              <span className="text-zinc-500 truncate">{p.name}</span>
              <span className="tabular-nums">
                {p.changed && p.base !== undefined && (
                  <span className="text-zinc-600 mr-0.5 line-through">{formatVal(p.base)}</span>
                )}
                <span className={p.changed ? "text-rose-300 font-medium" : "text-zinc-300"}>
                  {p.display !== undefined ? formatVal(p.display) : "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EdgeNode({ data }: { data: { label: string } }) {
  return (
    <div className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[9px] text-zinc-400 uppercase tracking-wider">
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  block: BlockNode as unknown as NodeTypes[string],
  edge: EdgeNode as unknown as NodeTypes[string],
};

// ---------------------------------------------------------------------------
// Layout — dagre LR
// ---------------------------------------------------------------------------

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  // Tighter spacing — chain spans much less horizontally now that block cards
  // are ~160px wide (vs the previous 240px) and edge nodes shrank with them.
  g.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 28, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const w = n.type === "edge" ? 60 : 160;
    const h = n.type === "edge" ? 22 : 70;
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    } as Node;
  });
}

// ---------------------------------------------------------------------------
// Topology derivation
// ---------------------------------------------------------------------------

/**
 * Build nodes + edges from the chain. We assume two paths max (path 0 = main,
 * path 1 = parallel) joined at a SPLIT/JOIN. Blocks are placed at SPLIT's
 * position and ordered by @position within each path.
 *
 * If a master has no parallel path (no path-1 blocks), we render a straight
 * line. If we can't read @path/@position (older formats), we fall back to
 * the order the API returned blocks in.
 */
function buildGraph(
  chain: ChainBlock[],
  snapshot: SnapshotState | undefined,
  pending: PendingPerSnap
): { nodes: Node[]; edges: Edge[] } {
  // Group by path
  const path0 = chain.filter((b) => (b.path ?? 0) === 0).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const path1 = chain.filter((b) => (b.path ?? 0) === 1).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const hasParallel = path1.length > 0;

  // If there's a parallel path, infer split position as the smallest path-1 position
  const splitPos = hasParallel ? Math.min(...path1.map((b) => b.position ?? 0)) : -1;
  const joinPos = hasParallel ? Math.max(...path1.map((b) => b.position ?? 0)) + 1 : -1;

  const beforeSplit = hasParallel ? path0.filter((b) => (b.position ?? 0) < splitPos) : path0;
  const inMain = hasParallel ? path0.filter((b) => (b.position ?? 0) >= splitPos && (b.position ?? 0) < joinPos) : [];
  const afterJoin = hasParallel ? path0.filter((b) => (b.position ?? 0) >= joinPos) : [];

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Input node
  nodes.push({
    id: "input",
    type: "edge",
    position: { x: 0, y: 0 },
    data: { label: "Input" },
  });

  const blockNode = (b: ChainBlock): Node => ({
    id: `${b.dsp}/${b.slot}`,
    type: "block",
    position: { x: 0, y: 0 },
    data: buildBlockNodeData(b, snapshot, pending),
  });

  // Build before-split chain
  let prev = "input";
  for (const b of beforeSplit) {
    const n = blockNode(b);
    nodes.push(n);
    edges.push({ id: `${prev}->${n.id}`, source: prev, target: n.id, animated: true });
    prev = n.id;
  }

  if (hasParallel) {
    const splitId = "split";
    nodes.push({ id: splitId, type: "edge", position: { x: 0, y: 0 }, data: { label: "Split" } });
    edges.push({ id: `${prev}->${splitId}`, source: prev, target: splitId, animated: true });

    // Path A — main inside split (US Double + 2x12 in user's rig)
    let prevA: string = splitId;
    for (const b of inMain) {
      const n = blockNode(b);
      nodes.push(n);
      edges.push({ id: `${prevA}->${n.id}`, source: prevA, target: n.id, animated: true });
      prevA = n.id;
    }

    // Path B — parallel (JCM800 + 4x12)
    let prevB: string = splitId;
    for (const b of path1) {
      const n = blockNode(b);
      nodes.push(n);
      edges.push({ id: `${prevB}->${n.id}`, source: prevB, target: n.id, animated: true });
      prevB = n.id;
    }

    const joinId = "join";
    nodes.push({ id: joinId, type: "edge", position: { x: 0, y: 0 }, data: { label: "Join" } });
    edges.push({ id: `${prevA}->${joinId}`, source: prevA, target: joinId, animated: true });
    edges.push({ id: `${prevB}->${joinId}`, source: prevB, target: joinId, animated: true });

    prev = joinId;
    for (const b of afterJoin) {
      const n = blockNode(b);
      nodes.push(n);
      edges.push({ id: `${prev}->${n.id}`, source: prev, target: n.id, animated: true });
      prev = n.id;
    }
  }

  // Output
  nodes.push({ id: "output", type: "edge", position: { x: 0, y: 0 }, data: { label: "Output" } });
  edges.push({
    id: `${prev}->output`,
    source: prev,
    target: "output",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  });

  return { nodes: layoutNodes(nodes, edges), edges };
}

// Effective state for a single block in the current snapshot
function buildBlockNodeData(
  block: ChainBlock,
  snapshot: SnapshotState | undefined,
  pending: PendingPerSnap
): BlockNodeData {
  const slotPath = `${block.dsp}/${block.slot}`;
  const baseEnabled = snapshot?.blocks[slotPath];
  const pendingBlock = pending[block.friendly];
  const pendingEnabled = pendingBlock?.enabled;
  const enabled =
    pendingEnabled !== undefined ? pendingEnabled : baseEnabled !== undefined ? baseEnabled : true;
  const enabledChanged = pendingEnabled !== undefined && pendingEnabled !== baseEnabled;

  const baseParams = { ...(block.defaults ?? {}), ...((snapshot?.params[slotPath]) ?? {}) };
  const pendingParams = pendingBlock?.params ?? {};

  // Show only params that the current snapshot overrides OR pending touches —
  // keeps card tight, avoids drowning the user in defaults.
  const keys = Array.from(
    new Set([
      ...Object.keys(snapshot?.params[slotPath] ?? {}),
      ...Object.keys(pendingParams),
    ])
  ).sort();

  const paramRows = keys.map((p) => {
    const base = baseParams[p];
    const pendingVal = pendingParams[p];
    const changed = pendingVal !== undefined && pendingVal !== base;
    const display = changed ? pendingVal : base;
    return { name: p, display, base, changed };
  });

  return { block, enabled, enabledChanged, paramRows };
}

function formatVal(n: number): string {
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignalChainFlow({ chain, snapshot, snapshotPending }: Props) {
  const { nodes, edges } = useMemo(
    () => buildGraph(chain, snapshot, snapshotPending),
    [chain, snapshot, snapshotPending]
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950" style={{ height: 440 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2.5}
      >
        <Background gap={20} size={1} color="#27272a" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
