import { useEffect, useMemo, useState } from 'react';
import { GitBranch, MoveRight } from 'lucide-react';
import { formatDateSmart } from '../lib/date.js';
import { Modal } from './ui.jsx';

const NODE_WIDTH = 184;
const NODE_HEIGHT = 76;
const COLUMN_GAP = 58;
const ROW_GAP = 14;

function buildGraph(task, tasks) {
  const all = [task, ...tasks.filter((item) => item.id !== task.id)];
  const byId = new Map(all.map((item) => [item.id, item]));
  const dependencies = new Map(all.map((item) => [item.id, item.dependency_ids || []]));
  const dependents = new Map(all.map((item) => [item.id, []]));
  for (const item of all) {
    for (const dependencyId of dependencies.get(item.id) || []) {
      if (dependents.has(dependencyId)) dependents.get(dependencyId).push(item.id);
    }
  }

  const component = new Set([task.id]);
  const queue = [task.id];
  while (queue.length) {
    const current = queue.shift();
    for (const next of [...(dependencies.get(current) || []), ...(dependents.get(current) || [])]) {
      if (byId.has(next) && !component.has(next)) {
        component.add(next);
        queue.push(next);
      }
    }
  }

  const nodes = [...component].map((id) => byId.get(id)).filter(Boolean);
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
  const processed = [];
  while (ready.length) {
    const current = ready.shift();
    processed.push(current);
    for (const edge of edges.filter((item) => item.source === current)) {
      levels.set(edge.target, Math.max(levels.get(edge.target) || 0, (levels.get(current) || 0) + 1));
      indegree.set(edge.target, (indegree.get(edge.target) || 1) - 1);
      if (indegree.get(edge.target) === 0) ready.push(edge.target);
    }
  }
  // Defensive fallback for legacy data that might contain a cycle.
  for (const node of nodes) {
    if (!processed.includes(node.id)) {
      levels.set(node.id, levels.get(node.id) || 0);
    }
  }

  const byLevel = new Map();
  for (const node of nodes) {
    const level = levels.get(node.id) || 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(node);
  }
  const maxLevel = Math.max(0, ...byLevel.keys());
  const maxRows = Math.max(1, ...[...byLevel.values()].map((items) => items.length));
  const width = Math.max(600, 64 + (maxLevel + 1) * NODE_WIDTH + maxLevel * COLUMN_GAP);
  const height = Math.max(250, 64 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP);
  const positions = new Map();
  for (const [level, items] of byLevel.entries()) {
    items.sort((a, b) => {
      const byDue = (a.due_date || '9999').localeCompare(b.due_date || '9999');
      return byDue || a.name.localeCompare(b.name, 'zh-CN');
    });
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
      const middleX = Math.max(x1 + 12, x1 + (x2 - x1) / 2);
      return {
        ...edge,
        d: `M ${x1} ${y1} H ${middleX} V ${y2} H ${x2}`,
      };
    })
    .filter(Boolean);
  return { nodes, links, positions, width, height };
}

export default function DependencyGraphModal({ open, onClose, task, tasks, onToggleDependency }) {
  const allTasks = useMemo(
    () => (task ? [task, ...(tasks || []).filter((item) => item.id !== task.id)] : []),
    [task, tasks]
  );
  const dependencyKey = (task?.dependencies || []).map((dependency) => dependency.id).join(',');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    setSelectedIds(new Set(dependencyKey ? dependencyKey.split(',') : []));
  }, [task?.id, dependencyKey]);

  const effectiveTask = useMemo(
    () => (task ? { ...task, dependency_ids: [...selectedIds] } : null),
    [task, selectedIds]
  );
  const graph = useMemo(
    () => (effectiveTask ? buildGraph(effectiveTask, tasks || []) : null),
    [effectiveTask, tasks]
  );
  const directDependencyIds = selectedIds;
  const directDependents = allTasks.filter((item) =>
    (item.dependency_ids || []).includes(task?.id)
  );

  async function toggleDependency(dependencyId) {
    const previous = new Set(selectedIds);
    const next = new Set(selectedIds);
    if (next.has(dependencyId)) next.delete(dependencyId);
    else next.add(dependencyId);
    setSelectedIds(next);
    const updated = await onToggleDependency?.(dependencyId);
    if (!updated) setSelectedIds(previous);
  }

  if (!task || !graph) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="任务依赖图"
      subtitle="箭头从前置任务指向后续任务；左侧为上游，右侧为下游"
      width={1060}
      className="dependency-graph-modal"
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>}
    >
      <div className="dependency-graph-layout">
        <div className="dependency-graph-main">
          {graph.nodes.length === 1 ? (
            <div className="dependency-graph-empty">
              <GitBranch size={26} />
              <h3>还没有依赖关系</h3>
              <p>在右侧勾选一个或多个前置任务，即可建立依赖图。</p>
            </div>
          ) : (
            <div className="dependency-graph-scroll">
              <div className="dependency-graph-canvas" style={{ width: graph.width, height: graph.height }}>
                <svg width={graph.width} height={graph.height} aria-hidden="true">
                  <defs>
                    <marker id="dependency-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0 L7,3.5 L0,7 Z" />
                    </marker>
                  </defs>
                  {graph.links.map((link) => (
                    <path
                      key={`${link.source}-${link.target}`}
                      d={link.d}
                      markerEnd="url(#dependency-arrow)"
                      className={link.target === task.id || link.source === task.id ? 'is-direct' : ''}
                    />
                  ))}
                </svg>
                {graph.nodes.map((node) => {
                  const position = graph.positions.get(node.id);
                  const isCurrent = node.id === task.id;
                  const isDependency = directDependencyIds.has(node.id);
                  const isDependent = directDependents.some((dependent) => dependent.id === node.id);
                  return (
                    <div
                      className={`dependency-node ${isCurrent ? 'is-current' : ''} ${isDependency ? 'is-upstream' : ''} ${isDependent ? 'is-downstream' : ''}`}
                      key={node.id}
                      style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                    >
                      <div className="dependency-node-top">
                        <span className="status-dot" style={{ background: node.status?.color || '#87909e' }} />
                        <strong>{node.name}</strong>
                        {isCurrent && <em>当前</em>}
                      </div>
                      <div className="dependency-node-meta">
                        <span>{node.status?.name || '未设置状态'}</span>
                        {node.due_date && <span>{formatDateSmart(node.due_date)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="dependency-graph-legend">
            <span><i className="is-upstream" /> 前置任务</span>
            <span><i className="is-current" /> 当前任务</span>
            <span><i className="is-downstream" /> 后续任务</span>
            <span><MoveRight size={12} /> 箭头方向：前置 → 后续</span>
          </div>
        </div>

        <aside className="dependency-graph-side">
          <div className="dependency-side-head">
            <GitBranch size={15} />
            <div>
              <h3>直接前置任务</h3>
              <p>勾选任务后，该任务需要等待被勾选任务完成。</p>
            </div>
          </div>
          <div className="dependency-editor-list">
            {allTasks.filter((item) => item.id !== task.id).map((item) => {
              const checked = directDependencyIds.has(item.id);
              return (
                <label className={`dependency-editor-row ${checked ? 'is-checked' : ''}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDependency(item.id)}
                  />
                  <span className="status-dot" style={{ background: item.status?.color || '#87909e' }} />
                  <span className="dependency-editor-name">{item.name}</span>
                  {item.due_date && <em>{formatDateSmart(item.due_date)}</em>}
                </label>
              );
            })}
          </div>
          <p className="dependency-graph-note">
            任务只能依赖其他任务，不能依赖自己；互相依赖会形成循环，系统会阻止保存。
          </p>
          {directDependents.length > 0 && (
            <div className="dependency-dependents">
              <h4>被以下任务依赖</h4>
              {directDependents.map((item) => (
                <span key={item.id}>{item.name}</span>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
