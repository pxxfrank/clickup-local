import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  GanttChartSquare,
  KanbanSquare,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  Link2,
  List as ListIcon,
  MoreHorizontal,
  PenLine,
  Plus,
  Presentation,
  Settings2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { useLocalStorage } from '../lib/hooks.js';
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  IconButton,
  MenuDivider,
  MenuItem,
  Modal,
  Popover,
  ProgressBar,
  Spinner,
} from './ui.jsx';
import ViewToolbar from './ViewToolbar.jsx';
import ListView from './ListView.jsx';
import BoardView from './BoardView.jsx';
import CalendarView from './CalendarView.jsx';
import GanttView from './GanttView.jsx';
import BrainstormView from './BrainstormView.jsx';
import ProjectOverview from './ProjectOverview.jsx';
import RetrospectiveView from './RetrospectiveView.jsx';
import WeeklyReportModal from './WeeklyReportModal.jsx';
import ListSettingsModal from './ListSettingsModal.jsx';
import MeetingView from './MeetingView.jsx';

const VIEWS = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'brainstorm', label: '头脑风暴', icon: Lightbulb },
  { id: 'list', label: '列表', icon: ListIcon },
  { id: 'board', label: '看板', icon: KanbanSquare },
  { id: 'calendar', label: '日历', icon: CalendarDays },
  { id: 'gantt', label: '甘特', icon: GanttChartSquare },
  { id: 'meetings', label: '会议', icon: Presentation },
  { id: 'retrospective', label: '复盘', icon: ClipboardCheck },
];

const DEFAULT_FILTERS = { assignee: 'all', priority: '', tagIds: [], statusIds: [], hideDone: false };
const PRIORITY_ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 0: 4 };

export default function ListPage({ listId, view, onViewChange }) {
  const { bootstrap, dataVersion, refresh, openTask, openCreateTask, openSettings, navigate, toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [prefs, setPrefs] = useLocalStorage(`clickup:view-prefs:${listId}`, {
    sort: 'manual',
    group: 'status',
    search: '',
    filters: DEFAULT_FILTERS,
  });
  const filters = { ...DEFAULT_FILTERS, ...(prefs.filters || {}) };
  const search = prefs.search || '';
  const sort = prefs.sort || 'manual';
  const group = prefs.group || 'status';
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await api.get(`/lists/${listId}`);
      setData(result);
      setError('');
    } catch (requestError) {
      if (requestError.status === 404) setError('列表不存在或已被删除');
      else setError(requestError.message);
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [listId]);

  useEffect(() => {
    if (!hasLoadedRef.current) setLoading(true);
    load();
  }, [load, dataVersion]);

  const setFilters = (next) => setPrefs((current) => ({ ...current, filters: typeof next === 'function' ? next(current.filters || DEFAULT_FILTERS) : next }));
  const setSearch = (value) => setPrefs((current) => ({ ...current, search: value }));
  const setSort = (value) => setPrefs((current) => ({ ...current, sort: value }));
  const setGroup = (value) => setPrefs((current) => ({ ...current, group: value }));

  const statuses = data?.statuses || [];
  const members = bootstrap?.members || [];
  const assignees = bootstrap?.assignees || members;
  const list = data?.list;

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    let tasks = [...data.tasks];
    if (filters.assignee === 'unassigned') tasks = tasks.filter((task) => !task.assignee_id);
    else if (filters.assignee !== 'all') tasks = tasks.filter((task) => task.assignee_id === filters.assignee);
    if (filters.priority !== '') tasks = tasks.filter((task) => String(task.priority) === String(filters.priority));
    if (filters.tagIds.length) {
      tasks = tasks.filter((task) => task.tags?.some((tag) => filters.tagIds.includes(tag.id)));
    }
    if (filters.statusIds.length) tasks = tasks.filter((task) => filters.statusIds.includes(task.status_id));
    if (filters.hideDone) tasks = tasks.filter((task) => !['done', 'closed'].includes(task.status?.type));
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.name.toLowerCase().includes(keyword) ||
          (task.description || '').toLowerCase().includes(keyword)
      );
    }
    if (sort === 'due') {
      tasks.sort((a, b) => {
        if (!a.due_date && !b.due_date) return a.order_index - b.order_index;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    } else if (sort === 'priority') {
      tasks.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
    } else if (sort === 'created') {
      tasks.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sort === 'name') {
      tasks.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    } else {
      tasks.sort((a, b) => a.order_index - b.order_index);
    }
    return tasks;
  }, [data, filters, search, sort]);

  const groups = useMemo(() => {
    if (!data) return [];
    if (group === 'none') return [{ key: 'all', label: '全部任务', kind: 'none', tasks: filteredTasks }];
    if (group === 'assignee') {
      const result = assignees.map((member) => ({
        key: member.id,
        label: member.name,
        kind: 'assignee',
        user: member,
        tasks: filteredTasks.filter((task) => task.assignee_id === member.id),
      }));
      result.push({
        key: 'unassigned',
        label: '未指派',
        kind: 'assignee',
        user: null,
        tasks: filteredTasks.filter((task) => !task.assignee_id),
      });
      return result.filter((item) => item.tasks.length || item.key === 'unassigned');
    }
    if (group === 'priority') {
      return [
        { key: 'p1', label: '紧急', priority: 1, kind: 'priority', tasks: filteredTasks.filter((task) => task.priority === 1) },
        { key: 'p2', label: '高', priority: 2, kind: 'priority', tasks: filteredTasks.filter((task) => task.priority === 2) },
        { key: 'p3', label: '普通', priority: 3, kind: 'priority', tasks: filteredTasks.filter((task) => task.priority === 3) },
        { key: 'p4', label: '低', priority: 4, kind: 'priority', tasks: filteredTasks.filter((task) => task.priority === 4) },
        { key: 'p0', label: '无优先级', priority: 0, kind: 'priority', tasks: filteredTasks.filter((task) => !task.priority) },
      ].filter((item) => item.tasks.length);
    }
    const shownStatuses = statuses.filter(
      (status) => !filters.statusIds.length || filters.statusIds.includes(status.id)
    );
    return shownStatuses.map((status) => ({
      key: status.id,
      label: status.name,
      kind: 'status',
      color: status.color,
      status,
      tasks: filteredTasks.filter((task) => task.status_id === status.id),
    }));
  }, [data, group, filteredTasks, assignees, statuses, filters.statusIds]);

  const stats = useMemo(() => {
    const tasks = data?.tasks || [];
    const done = tasks.filter((task) => ['done', 'closed'].includes(task.status?.type)).length;
    return { total: tasks.length, done, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }, [data]);

  async function handleUpdateTask(task, patch) {
    try {
      await api.patch(`/tasks/${task.id}`, patch);
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function handleComplete(task) {
    const completed = ['done', 'closed'].includes(task.status?.type);
    const nextStatus = completed
      ? statuses.find((status) => status.type === 'open') || statuses.find((status) => status.type === 'active')
      : statuses.find((status) => status.type === 'done') || statuses.find((status) => status.type === 'closed');
    if (!nextStatus) {
      toast('当前列表缺少可用的工作流状态', 'error');
      return;
    }
    await handleUpdateTask(task, { status_id: nextStatus.id });
  }

  async function handleAddTask(statusId, name) {
    if (name) {
      try {
        await api.post('/tasks', {
          list_id: list.id,
          name,
          status_id: statusId || statuses[0]?.id,
        });
        await refresh();
        return true;
      } catch (requestError) {
        toast(requestError.message, 'error');
        return false;
      }
    }
    openCreateTask({ list_id: list.id, status_id: statusId || statuses[0]?.id });
    return true;
  }

  const hasActiveFilters =
    filters.assignee !== 'all' ||
    filters.priority !== '' ||
    filters.tagIds.length > 0 ||
    filters.statusIds.length > 0 ||
    Boolean(filters.hideDone);
  const canReorder = group === 'status' && sort === 'manual' && !search.trim() && !hasActiveFilters;

  async function handleRenameTask(task, name) {
    try {
      await api.patch(`/tasks/${task.id}`, { name });
      await refresh();
      return true;
    } catch (requestError) {
      toast(requestError.message, 'error');
      return false;
    }
  }

  async function handleMoveTask(taskId, statusId, index) {
    try {
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, status_id: statusId, status: statuses.find((s) => s.id === statusId) || task.status } : task)),
        };
      });
      await api.post(`/tasks/${taskId}/move`, { status_id: statusId, index });
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
      await load();
    }
  }

  async function saveListName(event) {
    event.preventDefault();
    if (!renameValue.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/lists/${list.id}`, { name: renameValue.trim() });
      setRenameOpen(false);
      await refresh();
      toast('列表名称已更新');
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteList() {
    setBusy(true);
    try {
      await api.delete(`/lists/${list.id}`);
      toast('列表已删除');
      await refresh();
      navigate('/home');
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function saveAsTemplate(event) {
    event.preventDefault();
    if (!templateName.trim()) return;
    setTemplateBusy(true);
    try {
      await api.post(`/lists/${list.id}/templates`, { name: templateName.trim() });
      setTemplateOpen(false);
      await refresh();
      toast('项目模板已保存，可在空间菜单或文件夹菜单中使用');
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/#/list/${list.id}`);
      toast('链接已复制');
    } catch {
      toast('复制失败，请手动复制地址栏链接', 'error');
    }
  }

  if (loading && !data) {
    return (
      <div className="list-loading">
        <Spinner size={22} />
        <span>正在加载列表…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="list-error">
        <EmptyState
          icon={<ListIcon size={26} />}
          title={error || '列表不存在'}
          description="这个列表可能已经被删除，或你没有访问权限。"
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate('/home')}>
              返回主页
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="list-page">
      <div className="list-header">
        <div className="list-header-inner">
          <div className="list-title-row">
            <span
              className="list-icon-large"
              style={{
                background: `${list.color}26`,
                border: `1px solid ${list.color}55`,
                boxShadow: `inset 0 -3px 0 ${list.color}`,
              }}
            >
              {list.icon || '📋'}
            </span>
            <div className="list-title-text">
              <div className="list-title-line">
                <h1>{list.name}</h1>
                <Popover
                  width={210}
                  align="left"
                  trigger={
                    <button type="button" className="icon-btn list-menu-trigger" aria-label="列表菜单">
                      <MoreHorizontal size={17} />
                    </button>
                  }
                >
                  {({ close }) => (
                    <>
                      <MenuItem
                        icon={<PenLine size={15} />}
                        onClick={() => {
                          close();
                          setRenameValue(list.name);
                          setRenameOpen(true);
                        }}
                      >
                        重命名列表
                      </MenuItem>
                      <MenuItem
                        icon={<Settings2 size={15} />}
                        onClick={() => {
                          close();
                          setSettingsOpen(true);
                        }}
                      >
                        列表设置
                      </MenuItem>
                      <MenuItem
                        icon={<LayoutTemplate size={15} />}
                        onClick={() => {
                          close();
                          setTemplateName(`${list.name}模板`);
                          setTemplateOpen(true);
                        }}
                      >
                        另存为项目模板
                      </MenuItem>
                      <MenuItem
                        icon={<Link2 size={15} />}
                        onClick={() => {
                          close();
                          copyLink();
                        }}
                      >
                        复制列表链接
                      </MenuItem>
                      <MenuItem
                        icon={<UserPlus size={15} />}
                        onClick={() => {
                          close();
                          openSettings('members');
                        }}
                      >
                        邀请成员
                      </MenuItem>
                      <MenuDivider />
                      <MenuItem
                        danger
                        icon={<Trash2 size={15} />}
                        onClick={() => {
                          close();
                          setDeleteOpen(true);
                        }}
                      >
                        删除列表
                      </MenuItem>
                    </>
                  )}
                </Popover>
              </div>
              {list.description ? (
                <p className="list-description">{list.description}</p>
              ) : (
                <p className="list-description is-muted">暂无列表描述</p>
              )}
            </div>
            <div className="list-header-right">
              <div className="list-progress-block">
                <span>完成度</span>
                <div className="list-progress-row">
                  <ProgressBar value={stats.done} total={stats.total} color={list.color} height={6} />
                  <strong>{stats.percent}%</strong>
                </div>
                <span className="list-progress-count">{stats.done}/{stats.total} 个任务</span>
              </div>
              <button type="button" className="list-members" onClick={() => openSettings('members')} title="邀请成员">
                <div className="avatar-stack">
                  {members.slice(0, 4).map((member) => (
                    <Avatar key={member.id} user={member} size={26} className="avatar-stacked" />
                  ))}
                </div>
                <span className="list-members-add"><UserPlus size={14} /></span>
              </button>
            </div>
          </div>

          <div className="view-bar">
            <nav className="view-tabs">
              {VIEWS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`view-tab ${view === item.id ? 'is-active' : ''}`}
                    onClick={() => onViewChange(item.id)}
                    title={item.label}
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            {view !== 'meetings' && (
              <div className="view-bar-actions">
                <ViewToolbar
                  filters={filters}
                  setFilters={setFilters}
                  sort={sort}
                  setSort={setSort}
                  group={group}
                  setGroup={setGroup}
                  statuses={statuses}
                  search={search}
                  setSearch={setSearch}
                />
                <button type="button" className="btn btn-ghost btn-sm report-btn" onClick={() => setReportOpen(true)}>
                  <FileText size={15} />
                  周报
                </button>
                <button type="button" className="btn btn-primary btn-sm new-task-btn" onClick={() => openCreateTask({ list_id: list.id })}>
                  <Plus size={15} />
                  新建任务
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`list-content view-${view}`}>
        {view === 'list' && (
          <ListView
            groups={groups}
            statuses={statuses}
            members={assignees}
            onOpenTask={openTask}
            onComplete={handleComplete}
            onUpdateTask={handleUpdateTask}
            onAddTask={handleAddTask}
            onMoveTask={handleMoveTask}
            onRenameTask={handleRenameTask}
            canReorder={canReorder}
          />
        )}
        {view === 'board' && (
          <BoardView
            tasks={filteredTasks}
            statuses={statuses}
            onOpenTask={openTask}
            onMoveTask={handleMoveTask}
            onAddTask={(statusId) => handleAddTask(statusId)}
          />
        )}
        {view === 'calendar' && (
          <CalendarView
            tasks={filteredTasks}
            statuses={statuses}
            onOpenTask={openTask}
            onAddTask={(date) => openCreateTask({ list_id: list.id, due_date: date })}
          />
        )}
        {view === 'gantt' && <GanttView tasks={filteredTasks} onOpenTask={openTask} />}
        {view === 'meetings' && (
          <MeetingView
            list={list}
            tasks={data.tasks}
            onOpenTask={openTask}
            onChanged={refresh}
          />
        )}
        {view === 'retrospective' && (
          <RetrospectiveView
            listId={list.id}
            listName={list.name}
            onOpenTask={openTask}
            onCountChange={refresh}
          />
        )}
        {view === 'brainstorm' && (
          <BrainstormView
            listId={list.id}
            listName={list.name}
            statuses={statuses}
            onCommitted={async () => {
              await refresh();
              onViewChange('list');
            }}
          />
        )}
        {view === 'overview' && (
          <ProjectOverview
            list={list}
            tasks={data.tasks}
            milestones={data.milestones || []}
            phases={data.phases || []}
            onChanged={refresh}
            onOpenTask={openTask}
            onSaveAsTemplate={() => {
              setTemplateName(`${list.name}模板`);
              setTemplateOpen(true);
            }}
          />
        )}
      </div>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="重命名列表"
        width={430}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRenameOpen(false)}>取消</button>
            <button type="submit" form="rename-list-form" className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner size={15} /> : null}保存
            </button>
          </>
        }
      >
        <form id="rename-list-form" onSubmit={saveListName}>
          <label className="field">
            <span className="field-label">列表名称</span>
            <input className="input" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          </label>
        </form>
      </Modal>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="另存为项目模板"
        subtitle="从当前项目复制一份可复用的项目模板"
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setTemplateOpen(false)}>取消</button>
            <button type="submit" form="template-form" className="btn btn-primary" disabled={templateBusy || !templateName.trim()}>
              {templateBusy ? <Spinner size={15} /> : <LayoutTemplate size={15} />} 保存模板
            </button>
          </>
        }
      >
        <form id="template-form" className="stack" onSubmit={saveAsTemplate}>
          <label className="field">
            <span className="field-label">模板名称</span>
            <input
              className="input"
              autoFocus
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="例如：线上活动项目模板"
            />
          </label>
          <div className="template-save-note">
            <strong>将复制</strong>
            <span>工作流状态、自定义字段、任务与子任务、检查清单、标签、里程碑、项目背景与目的</span>
            <strong>不会复制</strong>
            <span>进展、附件和成员邀请</span>
          </div>
        </form>
      </Modal>

      <ListSettingsModal
        open={settingsOpen}
        list={list}
        statuses={statuses}
        fields={data.fields}
        onClose={() => setSettingsOpen(false)}
        onChanged={refresh}
      />

      <WeeklyReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        list={list}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="删除列表"
        message={`删除「${list.name}」将永久删除列表中的所有任务和进展，此操作无法撤销。`}
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteList}
      />
    </div>
  );
}
