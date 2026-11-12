import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flag,
  FolderKanban,
  Search,
  Target,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { formatDateSmart } from '../lib/date.js';
import { ProgressBar, Spinner } from './ui.jsx';

const HEALTH_META = {
  risk: { label: '有风险', className: 'is-risk' },
  attention: { label: '需关注', className: 'is-attention' },
  healthy: { label: '健康', className: 'is-healthy' },
};

export default function PortfolioPage() {
  const { bootstrap, dataVersion, navigate, toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spaceId, setSpaceId] = useState('all');
  const [health, setHealth] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const workspaceId = bootstrap?.workspace?.id;
    api
      .get(`/portfolio${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) toast(error.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap?.workspace?.id, dataVersion, toast]);

  const spaces = data?.projects
    ? [...new Map(data.projects.map((project) => [project.space_id, { id: project.space_id, name: project.space_name }])).values()]
    : [];

  const filtered = useMemo(() => {
    let projects = data?.projects || [];
    if (spaceId !== 'all') projects = projects.filter((project) => project.space_id === spaceId);
    if (health !== 'all') projects = projects.filter((project) => project.health === health);
    const keyword = search.trim().toLowerCase();
    if (keyword) {
      projects = projects.filter(
        (project) =>
          project.name.toLowerCase().includes(keyword) ||
          (project.space_name || '').toLowerCase().includes(keyword) ||
          (project.folder_name || '').toLowerCase().includes(keyword)
      );
    }
    return projects;
  }, [data, spaceId, health, search]);

  const totals = data?.totals;
  const riskCount = data?.projects?.filter((project) => project.health === 'risk').length || 0;

  return (
    <div className="portfolio-page">
      <section className="portfolio-hero">
        <div>
          <span className="eyebrow-plain">PORTFOLIO</span>
          <h1>项目组合</h1>
          <p>跨项目查看进度、风险和里程碑，快速判断哪些项目需要关注。</p>
        </div>
        <div className="portfolio-hero-mark"><FolderKanban size={28} /></div>
      </section>

      <section className="portfolio-stats">
        <div className="portfolio-stat">
          <span><FolderKanban size={15} /> 项目</span>
          <strong>{totals?.project_count ?? 0}</strong>
          <em>当前工作空间</em>
        </div>
        <div className="portfolio-stat">
          <span><Target size={15} /> 整体完成度</span>
          <strong>{totals?.completion ?? 0}%</strong>
          <ProgressBar value={totals?.task_done || 0} total={totals?.task_total || 0} color="#7B68EE" height={5} />
        </div>
        <div className="portfolio-stat">
          <span><Clock3 size={15} /> 逾期任务</span>
          <strong className={totals?.task_overdue ? 'is-danger' : ''}>{totals?.task_overdue ?? 0}</strong>
          <em>{totals?.task_total || 0} 个任务总计</em>
        </div>
        <div className="portfolio-stat">
          <span><AlertTriangle size={15} /> 风险项目</span>
          <strong className={riskCount ? 'is-danger' : ''}>{riskCount}</strong>
          <em>{totals?.milestone_total || 0} 个里程碑</em>
        </div>
      </section>

      <section className="portfolio-toolbar">
        <label className="portfolio-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索项目或空间"
          />
        </label>
        <div className="portfolio-filters">
          <select className="mini-select" value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
            <option value="all">全部空间</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>{space.name}</option>
            ))}
          </select>
          {[
            { id: 'all', label: '全部' },
            { id: 'risk', label: '有风险' },
            { id: 'attention', label: '需关注' },
            { id: 'healthy', label: '健康' },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              className={`portfolio-filter ${health === item.id ? 'is-active' : ''}`}
              onClick={() => setHealth(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="portfolio-loading"><Spinner size={18} /> 正在汇总项目…</div>
      ) : filtered.length ? (
        <div className="portfolio-grid">
          {filtered.map((project) => {
            const meta = HEALTH_META[project.health] || HEALTH_META.healthy;
            return (
              <button
                type="button"
                className="portfolio-card"
                key={project.id}
                onClick={() => navigate(`/list/${project.id}`)}
              >
                <div className="portfolio-card-top">
                  <span
                    className="portfolio-card-icon"
                    style={{ background: `${project.color}22`, borderColor: `${project.color}55` }}
                  >
                    {project.icon || '📋'}
                  </span>
                  <div className="portfolio-card-title">
                    <strong>{project.name}</strong>
                    <span>{project.space_name}{project.folder_name ? ` / ${project.folder_name}` : ''}</span>
                  </div>
                  <span className={`portfolio-health ${meta.className}`}>{meta.label}</span>
                </div>

                <div className="portfolio-progress">
                  <ProgressBar value={project.task_done} total={project.task_total} color={project.color} height={6} />
                  <strong>{project.completion}%</strong>
                </div>

                <div className="portfolio-card-stats">
                  <span><CheckCircle2 size={12} /> {project.task_done}/{project.task_total}</span>
                  <span className={project.task_overdue ? 'is-danger' : ''}><Clock3 size={12} /> {project.task_overdue} 逾期</span>
                  <span><Flag size={12} /> {project.milestone_done}/{project.milestone_total}</span>
                </div>

                <div className="portfolio-card-foot">
                  {project.phase_current ? (
                    <span className="portfolio-phase">
                      <i style={{ background: project.phase_current.color }} />
                      {project.phase_current.name}
                    </span>
                  ) : (
                    <span className="portfolio-muted">未设置阶段</span>
                  )}
                  {project.milestone_next ? (
                    <span className={`portfolio-next ${project.milestone_next.days_left < 0 ? 'is-danger' : ''}`}>
                      下一个：{project.milestone_next.name} · {formatDateSmart(project.milestone_next.due_date)}
                    </span>
                  ) : (
                    <span className="portfolio-muted">暂无待完成里程碑</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="portfolio-empty">
          <FolderKanban size={25} />
          <h3>没有符合条件的项目</h3>
          <p>调整空间、健康度筛选或搜索词后再试。</p>
        </section>
      )}
    </div>
  );
}
