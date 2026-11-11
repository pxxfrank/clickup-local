import { ArrowDownWideNarrow, ArrowUpDown, Check, EyeOff, Filter, Layers, ListFilter, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { Avatar, MenuDivider, MenuItem, Popover } from './ui.jsx';

export const SORT_OPTIONS = [
  { value: 'manual', label: '手动排序' },
  { value: 'due', label: '截止日期' },
  { value: 'priority', label: '优先级' },
  { value: 'created', label: '创建时间' },
  { value: 'name', label: '名称' },
];

export const GROUP_OPTIONS = [
  { value: 'status', label: '状态' },
  { value: 'assignee', label: '负责人' },
  { value: 'priority', label: '优先级' },
  { value: 'none', label: '不分组' },
];

const PRIORITY_FILTERS = [
  { value: '', label: '全部优先级' },
  { value: '1', label: '紧急' },
  { value: '2', label: '高' },
  { value: '3', label: '普通' },
  { value: '4', label: '低' },
  { value: '0', label: '无优先级' },
];

export default function ViewToolbar({ filters, setFilters, sort, setSort, group, setGroup, statuses, search, setSearch }) {
  const { bootstrap } = useApp();
  const members = bootstrap?.members || [];
  const tags = bootstrap?.tags || [];
  const activeFilterCount =
    (filters.assignee !== 'all' ? 1 : 0) +
    (filters.priority !== '' ? 1 : 0) +
    (filters.tagIds.length ? 1 : 0) +
    (filters.statusIds.length ? 1 : 0) +
    (filters.hideDone ? 1 : 0) +
    (search ? 1 : 0);

  function clearFilters() {
    setFilters({ assignee: 'all', priority: '', tagIds: [], statusIds: [], hideDone: false });
    setSearch('');
  }

  return (
    <div className="view-toolbar">
      <div className="inline-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索当前列表"
          aria-label="搜索当前列表"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="清除搜索">
            <X size={13} />
          </button>
        )}
      </div>

      <Popover
        width={286}
        align="right"
        trigger={
          <button type="button" className={`toolbar-btn ${activeFilterCount ? 'is-active' : ''}`}>
            <Filter size={15} />
            筛选
            {activeFilterCount > 0 && <span className="toolbar-count">{activeFilterCount}</span>}
          </button>
        }
      >
        <div className="filter-panel">
          <div className="filter-head">
            <strong>筛选条件</strong>
            <button type="button" onClick={clearFilters}>清除全部</button>
          </div>
          <label className="filter-field">
            <span>负责人</span>
            <div className="filter-avatars">
              <button
                type="button"
                className={`avatar-filter ${filters.assignee === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilters({ ...filters, assignee: 'all' })}
                title="全部成员"
              >
                全部
              </button>
              {members.map((member) => (
                <button
                  type="button"
                  key={member.id}
                  className={`avatar-filter avatar-filter-img ${filters.assignee === member.id ? 'is-active' : ''}`}
                  onClick={() =>
                    setFilters({ ...filters, assignee: filters.assignee === member.id ? 'all' : member.id })
                  }
                  title={member.name}
                >
                  <Avatar user={member} size={26} />
                </button>
              ))}
              <button
                type="button"
                className={`avatar-filter ${filters.assignee === 'unassigned' ? 'is-active' : ''}`}
                onClick={() =>
                  setFilters({ ...filters, assignee: filters.assignee === 'unassigned' ? 'all' : 'unassigned' })
                }
              >
                未指派
              </button>
            </div>
          </label>
          <label className="filter-field">
            <span>优先级</span>
            <select
              className="mini-select"
              value={filters.priority}
              onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
            >
              {PRIORITY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>状态</span>
            <div className="filter-statuses">
              {statuses.map((status) => {
                const active = filters.statusIds.includes(status.id);
                return (
                  <button
                    type="button"
                    key={status.id}
                    className={`filter-status-chip ${active ? 'is-active' : ''}`}
                    style={{ '--status-color': status.color }}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        statusIds: active
                          ? filters.statusIds.filter((id) => id !== status.id)
                          : [...filters.statusIds, status.id],
                      })
                    }
                  >
                    <span className="status-dot" style={{ background: status.color }} />
                    {status.name}
                    {active && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          </label>
          <div className="filter-field">
            <span>标签</span>
            <div className="filter-tags">
              {tags.map((tag) => {
                const active = filters.tagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    className={`filter-tag ${active ? 'is-active' : ''}`}
                    style={{ '--tag-color': tag.color }}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        tagIds: active ? filters.tagIds.filter((id) => id !== tag.id) : [...filters.tagIds, tag.id],
                      })
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className={`filter-toggle ${filters.hideDone ? 'is-on' : ''}`}
            onClick={() => setFilters({ ...filters, hideDone: !filters.hideDone })}
          >
            <EyeOff size={15} />
            隐藏已完成任务
            <span className="toggle-switch" />
          </button>
        </div>
      </Popover>

      <Popover
        width={190}
        align="right"
        trigger={
          <button type="button" className={`toolbar-btn ${sort !== 'manual' ? 'is-active' : ''}`}>
            <ArrowDownWideNarrow size={15} />
            排序
          </button>
        }
      >
        {({ close }) => (
          <>
            <div className="menu-label">排序方式</div>
            {SORT_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                active={sort === option.value}
                onClick={() => {
                  setSort(option.value);
                  close();
                }}
              >
                {option.label}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>

      <Popover
        width={190}
        align="right"
        trigger={
          <button type="button" className={`toolbar-btn ${group !== 'status' ? 'is-active' : ''}`}>
            <Layers size={15} />
            分组
          </button>
        }
      >
        {({ close }) => (
          <>
            <div className="menu-label">分组依据</div>
            {GROUP_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                active={group === option.value}
                onClick={() => {
                  setGroup(option.value);
                  close();
                }}
              >
                {option.label}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>

      {activeFilterCount > 0 && (
        <button type="button" className="toolbar-clear" onClick={clearFilters} title="清除筛选">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
