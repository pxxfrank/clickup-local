import { useMemo, useState } from 'react';
import { GitBranch, Network, Star } from 'lucide-react';
import { formatDateSmart } from '../lib/date.js';

const NODE_WIDTH = 188;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 60;
const ROW_GAP = 16;

function buildGraph(tasks, mode) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const dependencies = new Map(tasks.map((task) => [task.id, (task.dependency_ids || []).filter((id) => byId.has(id))]));
  const keyIds = new Set(tasks.filter((task) => task.is_key_action).map((task) => task.id));
  const selected = new Set();
  if (mode === 'key') {
    for (const keyId of keyIds) {
      if (!byId.has(keyId)) continue;
      if (!selected.has(keyId)) {
        selected.add(keyId);
        const queue = [keyId];
        while (queue.length) {
          const current = queue.shift();
          for (const dependencyId of dependencies.get(current) || []) {
            if (!selected.has(dependencyId)) {
              selected.add(dependencyId);
              queue.push(dependencyId);
            }
          }
        }
      }
    }
  } else {
    for (const task of tasks) selected.add(task.id);
  }
  const nodes = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const node of nodes) {
    for (const dependencyId of dependencies.get(node.id) || []) {
      if (!nodeIds.has(dependencyId)) continue;
      edges.push({ source: dependencyId, target: node.id });
      indegree.set(node.id, (indegree.get(node.id) || 0) + 1);
    }
  }
  const levels = new Map(nodes.map((node) => [node.id, 0]));
  const ready = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
  const processed = new Set();
  while (ready.length) {
    const current = ready.shift();
    processed.add(current);
    for (const edge of edges.filter((item) => item.source === current)) {
      levels.set(edge.target, Math.max(levels.get(edge.target) || 0, (levels.get(current) || 0) + 1));
      indegree.set(edge.target, (indegree.get(edge.target) || 1) - 1);
      if (indegree.get(edge.target) === 0) ready.push(edge.target);
    }
  }
  for (const node of nodes) if (!processed.has(node.id)) levels.set(node.id, levels.get(node.id) || 0);

  const byLevel = new Map();
  for (const node of nodes) {
    const level = levels.get(node.id) || 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(node);
  }
  for (const items of byLevel.values()) {
    items.sort((a, b) => {
      if (Boolean(a.is_key_action) !== Boolean(b.is_key_action)) return a.is_key_action ? -1 : 1;
      return (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.name.localeCompare(b.name, 'zh-CN');
    });
  }
  const maxLevel = Math.max(0, ...byLevel.keys());
  const maxRows = Math.max(1, ...[...byLevel.values()].map((items) => items.length));
  const width = Math.max(720, 64 + (maxLevel + 1) * NODE_WIDTH + maxLevel * COLUMN_GAP);
  const height = Math.max(300, 64 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP);
  const positions = new Map();
  for (const [level, items] of byLevel.entries()) {
    const contentHeight = items.length * NODE_HEIGHT + (items.length - 1) * ROW_GAP;
    const startY = (height - contentHeight) / 2;
    items.forEach((node, index) => {
      positions.set(node.id, {
        x: 32 + level * (NODE_WIDTH + COLUMN_GAP),
        y: startY + index * (NODE_HEIGHT + ROW_GAP),
        level,
      });
    });
  }
  const links = edges
    .map((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) return null;
      const x1 = source.x + NODE_WIDTH;
      const y1 = source.y + NODE_HEIGHT / 2;
      const x2 = target.x - 4;
      const y2 = target.y + NODE_HEIGHT / 2;
      const midX = Math.max(x1 + 12, x1 + (x2 - x1) / 2);
      return { ...edge, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` };
    })
    .filter(Boolean);
  const isolated = nodes.filter((node) => !edges.some((edge) => edge.source === node.id || edge.target === node.id));
  return { nodes, links, positions, width, height, keyIds, isolated };
}

export default function ProjectDependencyGraph({ tasks, onOpenTask }) {
  const [mode, setMode] = useState('key');
  const graph = useMemo(() => buildGraph(tasks, mode), [tasks, mode]);
  const keyActions = useMemo(() => tasks.filter((task) => task.is_key_action), [tasks]);
  const keyIds = new Set(keyActions.map((task) => task.id));
  const done = (task) => ['done', 'closed'].includes(task.status?.type);
  const blocked = (task) => (task.dependency_ids || []).some((id) => {
    const dependency = tasks.find((item) => item.id === id);
    return dependency && !done(dependency);
  });
  const blockedCount = graph.nodes.filter(blocked).length;

  return (
    <div className="project-graph-view">
      <div className="project-graph-head">
        <div>
          <h2><Network size={18} /> 项目依赖图</h2>
          <p>默认展示关键动作及其依赖链，帮助识别阻塞点和上游前置工作。</p>
        </div>
        <div className="project-graph-controls">
          <button type="button" className={mode === 'key' ? 'is-active' : ''} onClick={() => setMode('key')}>
            关键动作 + 依赖链
          </button>
          <button type="button" className={mode === 'all' ? 'is-active' : ''} onClick={() => setMode('all')}>
            全部任务
          </button>
        </div>
      </div>

      <div className="project-graph-summary">
        <span><Star size={12} /> {keyActions.length} 个关键动作</span>
        <span><GitBranch size={12} /> {graph.links.length} 条依赖</span>
        <span className={blockedCount ? 'is-danger' : ''}>阻塞 {blockedCount}</span>
        <span>显示 {graph.nodes.length} 个任务</span>
      </div>

      {mode === 'key' && !keyActions.length ? (
        <div className="project-graph-empty">
          <Star size={28} />
          <h3>还没有关键动作</h3>
          <p>先在「项目概览 → 关键动作」中梳理项目最重要的动作，再回来查看依赖链。</p>
        </div>
      ) : graph.nodes.length === 0 ? (
        <div className="project-graph-empty">
          <Network size={28} />
          <h3>还没有已建立依赖的任务</h3>
          <p>到任务详情中绑定前置任务后，这里会显示项目级拓扑图。</p>
        </div>
      ) : (
        <div className="project-graph-layout">
          <div className="project-graph-main">
            <div className="project-graph-scroll">
              <div className="project-graph-canvas" style={{ width: graph.width, height: graph.height }}>
                <svg width={graph.width} height={graph.height} aria-hidden="true">
                  <defs>
                    <marker id="project-graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0 L7,3.5 L0,7 Z" />
                    </marker>
                  </defs>
                  {graph.links.map((link) => (
                    <path key={`${link.source}-${link.target}`} d={link.d} markerEnd="url(#project-graph-arrow)" />
                  ))}
                </svg>
                {graph.nodes.map((node) => {
                  const position = graph.positions.get(node.id);
                  const isKey = Boolean(node.is_key_action);
                  const isBlocked = blocked(node);
                  return (
                    <button
                      type="button"
                      className={`project-graph-node ${isKey ? 'is-key' : ''} ${isBlocked ? 'is-blocked' : ''} ${done(node) ? 'is-done' : ''}`}
                      key={node.id}
                      style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                      onClick={() => onOpenTask(node.id)}
                    >
                      <div className="project-graph-node-top">
                        <span className="status-dot" style={{ background: node.status?.color || '#87909e' }} />
                        <strong>{node.name}</strong>
                        {isKey && <Star size={11} className="project-graph-star" />}
                      </div>
                      <div className="project-graph-node-meta">
                        <span>{node.status?.name || '未设置状态'}</span>
                        <span>{node.due_date ? formatDateSmart(node.due_date) : '未排期'}</span>
                      </div>
                      {isBlocked && <span className="project-graph-blocked">等待前置任务</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="project-graph-legend">
              <span><i className="is-key" /> 关键动作</span>
              <span><i className="is-blocked" /> 被阻塞</span>
              <span><GitBranch size={11} /> 箭头：前置 → 后续</span>
            </div>
          </div>
          <aside className="project-graph-side">
            <h3>关键动作</h3>
            {keyActions.length ? keyActions.map((task) => (
              <button type="button" className="project-graph-key-row" key={task.id} onClick={() => onOpenTask(task.id)}>
                <Star size={11} />
                <span>{task.name}</span>
                <em>{task.status?.name || '未设置'}</em>
              </button>
            )) : <p className="project-graph-side-empty">在项目概览中添加关键动作。</p>}
            {graph.isolated.length > 0 && (
              <>
                <h3 className="is-secondary">未连接任务</h3>
                {graph.isolated.slice(0, 12).map((task) => (
                  <button type="button" className="project-graph-isolated" key={task.id} onClick={() => onOpenTask(task.id)}>
                    {task.name}
                  </button>
                ))}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
