import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { PROJECT_COLORS, colorInfo } from '../lib/colors.js';
import { ConfirmDialog, Modal, Spinner } from './ui.jsx';

const STATUS_COLORS = ['#87909e', '#4a9eff', '#a25ddc', '#f59e0b', '#2ea44f', '#e5484d', '#26c6da', '#6b7280'];
const LIST_ICONS = ['📋', '🏃', '🐞', '📄', '💻', '🎨', '🔬', '✍️', '🎪', '📈', '🤝', '👋', '📌', '🧪'];
const FIELD_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '下拉选择' },
  { value: 'date', label: '日期' },
  { value: 'checkbox', label: '复选框' },
];
const STATUS_TYPES = [
  { value: 'open', label: '待处理' },
  { value: 'active', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'closed', label: '已关闭' },
];

export default function ListSettingsModal({ open, list, statuses, fields, onClose, onChanged }) {
  const { bootstrap, toast } = useApp();
  const [tab, setTab] = useState('status');
  const [busy, setBusy] = useState(false);
  const [editingStatus, setEditingStatus] = useState(null);
  const [newStatus, setNewStatus] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldDraft, setFieldDraft] = useState(null);
  const [general, setGeneral] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [automationDraft, setAutomationDraft] = useState(null);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [deleteAutomationTarget, setDeleteAutomationTarget] = useState(null);

  useEffect(() => {
    if (open && list) {
      setTab('status');
      setGeneral({
        name: list.name,
        description: list.description || '',
        purpose: list.purpose || '',
        color: list.color,
        icon: list.icon || '📋',
      });
      setEditingStatus(null);
      setNewStatus(null);
      setFieldDraft(null);
      setAutomationDraft(null);
      setDeleteAutomationTarget(null);
      api
        .get(`/lists/${list.id}/automations`)
        .then((data) => setAutomations(data.automations || []))
        .catch(() => setAutomations([]));
    }
  }, [open, list?.id]);

  const sortedStatuses = useMemo(() => [...(statuses || [])], [statuses]);
  const members = bootstrap?.members || [];
  const tags = bootstrap?.tags || [];

  const triggerLabel = (rule) => {
    if (rule.trigger_type === 'task_created') return '任务创建时';
    if (rule.trigger_type === 'task_completed') return '任务完成时';
    const target = statuses?.find((status) => status.id === rule.trigger_config?.status_id);
    return target ? `状态变更为「${target.name}」` : '任意状态变更';
  };

  const actionLabel = (rule) => {
    if (rule.action_type === 'set_status') {
      return `将状态改为「${statuses?.find((status) => status.id === rule.action_config?.status_id)?.name || '未知状态'}」`;
    }
    if (rule.action_type === 'set_assignee') {
      const person = members.find((member) => member.id === rule.action_config?.assignee_id);
      return person ? `指派给 ${person.name}` : '清除负责人';
    }
    if (rule.action_type === 'set_priority') {
      return `设置优先级为「${['无', '紧急', '高', '普通', '低'][Number(rule.action_config?.priority) || 0] || '无'}」`;
    }
    return `添加标签「${tags.find((tag) => tag.id === rule.action_config?.tag_id)?.name || '未知标签'}」`;
  };

  function newAutomationDraft() {
    setAutomationDraft({
      id: null,
      name: '',
      trigger_type: 'status_changed',
      triggerStatusId: statuses?.[0]?.id || '',
      action_type: 'set_status',
      actionStatusId: statuses?.[0]?.id || '',
      actionAssigneeId: '',
      actionPriority: 2,
      actionTagId: tags[0]?.id || '',
      enabled: true,
    });
  }

  function editAutomation(rule) {
    setAutomationDraft({
      id: rule.id,
      name: rule.name,
      trigger_type: rule.trigger_type,
      triggerStatusId: rule.trigger_config?.status_id || '',
      action_type: rule.action_type,
      actionStatusId: rule.action_config?.status_id || statuses?.[0]?.id || '',
      actionAssigneeId: rule.action_config?.assignee_id || '',
      actionPriority: Number(rule.action_config?.priority) || 0,
      actionTagId: rule.action_config?.tag_id || tags[0]?.id || '',
      enabled: rule.enabled,
    });
  }

  async function reloadAutomations() {
    if (!list?.id) return;
    const data = await api.get(`/lists/${list.id}/automations`);
    setAutomations(data.automations || []);
  }

  async function saveAutomation(event) {
    event.preventDefault();
    if (!automationDraft?.name?.trim()) return;
    const trigger_config =
      automationDraft.trigger_type === 'status_changed' && automationDraft.triggerStatusId
        ? { status_id: automationDraft.triggerStatusId }
        : {};
    let action_config = {};
    if (automationDraft.action_type === 'set_status') action_config = { status_id: automationDraft.actionStatusId };
    if (automationDraft.action_type === 'set_assignee') action_config = { assignee_id: automationDraft.actionAssigneeId || null };
    if (automationDraft.action_type === 'set_priority') action_config = { priority: Number(automationDraft.actionPriority) };
    if (automationDraft.action_type === 'add_tag') action_config = { tag_id: automationDraft.actionTagId };
    setAutomationBusy(true);
    try {
      const payload = {
        name: automationDraft.name.trim(),
        trigger_type: automationDraft.trigger_type,
        trigger_config,
        action_type: automationDraft.action_type,
        action_config,
        enabled: automationDraft.enabled,
      };
      if (automationDraft.id) await api.patch(`/automations/${automationDraft.id}`, payload);
      else await api.post(`/lists/${list.id}/automations`, payload);
      setAutomationDraft(null);
      await reloadAutomations();
      toast(automationDraft.id ? '自动化规则已更新' : '自动化规则已创建');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setAutomationBusy(false);
    }
  }

  async function toggleAutomation(rule) {
    try {
      await api.patch(`/automations/${rule.id}`, { enabled: !rule.enabled });
      await reloadAutomations();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function removeAutomation() {
    if (!deleteAutomationTarget) return;
    setAutomationBusy(true);
    try {
      await api.delete(`/automations/${deleteAutomationTarget.id}`);
      setDeleteAutomationTarget(null);
      await reloadAutomations();
      toast('自动化规则已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setAutomationBusy(false);
    }
  }

  async function saveStatus(status, patch) {
    setBusy(true);
    try {
      await api.patch(`/statuses/${status.id}`, patch);
      setEditingStatus(null);
      await onChanged();
      toast('状态已更新');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createStatus(event) {
    event.preventDefault();
    if (!newStatus?.name?.trim()) return;
    setBusy(true);
    try {
      await api.post(`/lists/${list.id}/statuses`, {
        name: newStatus.name.trim(),
        color: newStatus.color,
        type: newStatus.type,
      });
      setNewStatus(null);
      await onChanged();
      toast('状态已创建');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeTarget() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.kind === 'status') await api.delete(`/statuses/${deleteTarget.id}`);
      else await api.delete(`/fields/${deleteTarget.id}`);
      setDeleteTarget(null);
      await onChanged();
      toast('已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function moveStatus(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sortedStatuses.length) return;
    const ids = sortedStatuses.map((status) => status.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setBusy(true);
    try {
      await api.post(`/lists/${list.id}/statuses/reorder`, { ids });
      await onChanged();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createField(event) {
    event.preventDefault();
    if (!fieldDraft?.name?.trim()) return;
    setBusy(true);
    try {
      await api.post(`/lists/${list.id}/fields`, {
        name: fieldDraft.name.trim(),
        type: fieldDraft.type,
        options:
          fieldDraft.type === 'select'
            ? fieldDraft.options.split(',').map((option) => option.trim()).filter(Boolean)
            : [],
      });
      setFieldDraft(null);
      await onChanged();
      toast('字段已添加');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeField(field) {
    await api.delete(`/fields/${field.id}`);
    await onChanged();
  }

  async function saveGeneral(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/lists/${list.id}`, general);
      await onChanged();
      toast('列表信息已更新');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!list) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="列表设置" subtitle={list.name} width={720} hideClose={false}>
        <div className="settings-tabs">
          <button type="button" className={tab === 'status' ? 'is-active' : ''} onClick={() => setTab('status')}>工作流状态</button>
          <button type="button" className={tab === 'fields' ? 'is-active' : ''} onClick={() => setTab('fields')}>自定义字段</button>
          <button type="button" className={tab === 'automations' ? 'is-active' : ''} onClick={() => setTab('automations')}>
            自动化 <span className="settings-tab-count">{automations.length}</span>
          </button>
          <button type="button" className={tab === 'general' ? 'is-active' : ''} onClick={() => setTab('general')}>列表信息</button>
        </div>

        {tab === 'status' && (
          <div className="settings-pane">
            <p className="settings-hint">状态决定任务在列表和看板中的归组方式。点击箭头调整顺序。</p>
            <div className="status-settings-list">
              {sortedStatuses.map((status, index) => (
                <div className="status-setting-row" key={status.id}>
                  {editingStatus?.id === status.id ? (
                    <form
                      className="status-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveStatus(status, editingStatus);
                      }}
                    >
                      <input
                        className="input"
                        value={editingStatus.name}
                        onChange={(event) => setEditingStatus({ ...editingStatus, name: event.target.value })}
                        autoFocus
                      />
                      <div className="color-picker color-picker-sm">
                        {STATUS_COLORS.map((color) => (
                          <button
                            type="button"
                            key={color}
                            className={`color-option color-option-sm ${editingStatus.color === color ? 'is-active' : ''}`}
                            style={{ background: color }}
                            onClick={() => setEditingStatus({ ...editingStatus, color })}
                          />
                        ))}
                      </div>
                      <select
                        className="mini-select"
                        value={editingStatus.type}
                        onChange={(event) => setEditingStatus({ ...editingStatus, type: event.target.value })}
                      >
                        {STATUS_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-primary btn-xs" disabled={busy}>保存</button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditingStatus(null)}>取消</button>
                    </form>
                  ) : (
                    <>
                      <span className="status-setting-dot" style={{ background: status.color }} />
                      <span className="status-setting-name">{status.name}</span>
                      <span className="status-type-badge">{STATUS_TYPES.find((type) => type.value === status.type)?.label}</span>
                      <div className="status-setting-actions">
                        <button type="button" className="icon-btn" onClick={() => moveStatus(index, -1)} disabled={index === 0 || busy} title="上移">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="icon-btn" onClick={() => moveStatus(index, 1)} disabled={index === sortedStatuses.length - 1 || busy} title="下移">
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" className="icon-btn" onClick={() => setEditingStatus({ name: status.name, color: status.color, type: status.type })} title="编辑">
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          onClick={() => setDeleteTarget({ kind: 'status', id: status.id, name: status.name })}
                          disabled={sortedStatuses.length <= 1}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {newStatus ? (
              <form className="status-add-form" onSubmit={createStatus}>
                <input
                  className="input"
                  autoFocus
                  placeholder="新状态名称"
                  value={newStatus.name}
                  onChange={(event) => setNewStatus({ ...newStatus, name: event.target.value })}
                />
                <div className="color-picker color-picker-sm">
                  {STATUS_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`color-option color-option-sm ${newStatus.color === color ? 'is-active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setNewStatus({ ...newStatus, color })}
                    />
                  ))}
                </div>
                <select className="mini-select" value={newStatus.type} onChange={(event) => setNewStatus({ ...newStatus, type: event.target.value })}>
                  {STATUS_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? <Spinner size={14} /> : <Check size={14} />} 添加
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewStatus(null)}>取消</button>
              </form>
            ) : (
              <button type="button" className="settings-add-btn" onClick={() => setNewStatus({ name: '', color: '#4a9eff', type: 'active' })}>
                <Plus size={15} /> 添加状态
              </button>
            )}
          </div>
        )}

        {tab === 'fields' && (
          <div className="settings-pane">
            <p className="settings-hint">自定义字段会出现在此列表每个任务的详情中，例如「故事点」「影响版本」。</p>
            <div className="fields-settings-list">
              {(fields || []).map((field) => (
                <div className="field-setting-row" key={field.id}>
                  <span className="field-setting-name">{field.name}</span>
                  <span className="field-type-badge">{FIELD_TYPES.find((type) => type.value === field.type)?.label || field.type}</span>
                  {field.type === 'select' && field.options?.length > 0 && (
                    <span className="field-options">{field.options.join(' / ')}</span>
                  )}
                  <button type="button" className="icon-btn icon-btn-danger" onClick={() => setDeleteTarget({ kind: 'field', id: field.id, name: field.name })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!fields?.length && <p className="settings-empty">还没有自定义字段。</p>}
            </div>
            {fieldDraft ? (
              <form className="field-add-form" onSubmit={createField}>
                <input
                  className="input"
                  autoFocus
                  placeholder="字段名称"
                  value={fieldDraft.name}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, name: event.target.value })}
                />
                <select
                  className="mini-select"
                  value={fieldDraft.type}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, type: event.target.value })}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {fieldDraft.type === 'select' && (
                  <input
                    className="input"
                    placeholder="选项，用逗号分隔"
                    value={fieldDraft.options}
                    onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value })}
                  />
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? <Spinner size={14} /> : <Check size={14} />} 添加
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFieldDraft(null)}>取消</button>
              </form>
            ) : (
              <button
                type="button"
                className="settings-add-btn"
                onClick={() => setFieldDraft({ name: '', type: 'text', options: '' })}
              >
                <Plus size={15} /> 添加字段
              </button>
            )}
          </div>
        )}

        {tab === 'automations' && (
          <div className="settings-pane">
            <div className="automation-head">
              <p className="settings-hint">当任务创建、完成或状态变化时自动执行一个动作。自动化不会重复触发自身。</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={newAutomationDraft}>
                <Plus size={14} /> 新建规则
              </button>
            </div>

            {automationDraft && (
              <form className="automation-form" onSubmit={saveAutomation}>
                <label className="field">
                  <span className="field-label">规则名称</span>
                  <input
                    className="input"
                    autoFocus
                    value={automationDraft.name}
                    onChange={(event) => setAutomationDraft({ ...automationDraft, name: event.target.value })}
                    placeholder="例如：进入进行中后指派给负责人"
                  />
                </label>
                <div className="form-grid-2">
                  <label className="field">
                    <span className="field-label">触发条件</span>
                    <select
                      className="input"
                      value={automationDraft.trigger_type}
                      onChange={(event) => setAutomationDraft({ ...automationDraft, trigger_type: event.target.value })}
                    >
                      <option value="task_created">任务创建时</option>
                      <option value="status_changed">状态变更时</option>
                      <option value="task_completed">任务完成时</option>
                    </select>
                  </label>
                  {automationDraft.trigger_type === 'status_changed' ? (
                    <label className="field">
                      <span className="field-label">变更为</span>
                      <select
                        className="input"
                        value={automationDraft.triggerStatusId}
                        onChange={(event) => setAutomationDraft({ ...automationDraft, triggerStatusId: event.target.value })}
                      >
                        <option value="">任意状态</option>
                        {sortedStatuses.map((status) => (
                          <option key={status.id} value={status.id}>{status.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="automation-trigger-note">
                      {automationDraft.trigger_type === 'task_created' ? '每次创建任务时触发' : '任务进入完成/关闭状态时触发'}
                    </div>
                  )}
                </div>

                <div className="form-grid-2">
                  <label className="field">
                    <span className="field-label">执行动作</span>
                    <select
                      className="input"
                      value={automationDraft.action_type}
                      onChange={(event) => setAutomationDraft({ ...automationDraft, action_type: event.target.value })}
                    >
                      <option value="set_status">修改状态</option>
                      <option value="set_assignee">指派负责人</option>
                      <option value="set_priority">设置优先级</option>
                      <option value="add_tag">添加标签</option>
                    </select>
                  </label>
                  {automationDraft.action_type === 'set_status' && (
                    <label className="field">
                      <span className="field-label">目标状态</span>
                      <select
                        className="input"
                        value={automationDraft.actionStatusId}
                        onChange={(event) => setAutomationDraft({ ...automationDraft, actionStatusId: event.target.value })}
                      >
                        {sortedStatuses.map((status) => (
                          <option key={status.id} value={status.id}>{status.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {automationDraft.action_type === 'set_assignee' && (
                    <label className="field">
                      <span className="field-label">负责人</span>
                      <select
                        className="input"
                        value={automationDraft.actionAssigneeId}
                        onChange={(event) => setAutomationDraft({ ...automationDraft, actionAssigneeId: event.target.value })}
                      >
                        <option value="">清除负责人</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {automationDraft.action_type === 'set_priority' && (
                    <label className="field">
                      <span className="field-label">优先级</span>
                      <select
                        className="input"
                        value={automationDraft.actionPriority}
                        onChange={(event) => setAutomationDraft({ ...automationDraft, actionPriority: Number(event.target.value) })}
                      >
                        <option value={1}>紧急</option>
                        <option value={2}>高</option>
                        <option value={3}>普通</option>
                        <option value={4}>低</option>
                        <option value={0}>无</option>
                      </select>
                    </label>
                  )}
                  {automationDraft.action_type === 'add_tag' && (
                    <label className="field">
                      <span className="field-label">标签</span>
                      <select
                        className="input"
                        value={automationDraft.actionTagId}
                        onChange={(event) => setAutomationDraft({ ...automationDraft, actionTagId: event.target.value })}
                      >
                        {tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="automation-form-foot">
                  <label className="automation-enabled">
                    <input
                      type="checkbox"
                      checked={automationDraft.enabled}
                      onChange={(event) => setAutomationDraft({ ...automationDraft, enabled: event.target.checked })}
                    />
                    启用规则
                  </label>
                  <div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAutomationDraft(null)}>取消</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={automationBusy || !automationDraft.name.trim()}>
                      {automationBusy ? <Spinner size={13} /> : null} 保存规则
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="automation-list">
              {automations.map((rule) => (
                <div className={`automation-row ${rule.enabled ? '' : 'is-disabled'}`} key={rule.id}>
                  <span className="automation-icon"><Zap size={14} /></span>
                  <div className="automation-main">
                    <strong>{rule.name}</strong>
                    <span>{triggerLabel(rule)} → {actionLabel(rule)}</span>
                  </div>
                  <button
                    type="button"
                    className={`automation-toggle ${rule.enabled ? 'is-on' : ''}`}
                    onClick={() => toggleAutomation(rule)}
                    title={rule.enabled ? '停用规则' : '启用规则'}
                  >
                    <span />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => editAutomation(rule)} title="编辑规则">
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" onClick={() => setDeleteAutomationTarget(rule)} title="删除规则">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {!automations.length && !automationDraft && (
                <div className="automation-empty">
                  <Zap size={20} />
                  <p>还没有自动化规则。</p>
                  <span>例如：任务进入「已完成」时，自动添加「本周交付」标签。</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'general' && general && (
          <form className="settings-pane general-form" onSubmit={saveGeneral}>
            <label className="field">
              <span className="field-label">列表名称</span>
              <input className="input" value={general.name} onChange={(event) => setGeneral({ ...general, name: event.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">描述</span>
              <textarea
                className="input textarea"
                rows={3}
                value={general.description}
                onChange={(event) => setGeneral({ ...general, description: event.target.value })}
                placeholder="这个列表用来管理什么？"
              />
            </label>
            <label className="field">
              <span className="field-label">项目背景与目的</span>
              <textarea
                className="input textarea"
                rows={4}
                value={general.purpose || ''}
                onChange={(event) => setGeneral({ ...general, purpose: event.target.value })}
                placeholder="为什么要做这个项目？希望达成什么结果？"
              />
            </label>
            <div className="field">
              <span className="field-label">图标</span>
              <div className="emoji-picker">
                {LIST_ICONS.map((icon) => (
                  <button
                    type="button"
                    key={icon}
                    className={`emoji-option ${general.icon === icon ? 'is-active' : ''}`}
                    onClick={() => setGeneral({ ...general, icon })}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">识别色</span>
              <div className="color-picker">
                {PROJECT_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color.value}
                    className={`color-option ${general.color === color.value ? 'is-active' : ''}`}
                    style={{ background: color.value }}
                    onClick={() => setGeneral({ ...general, color: color.value })}
                    aria-label={`${color.name} · ${color.meaning}`}
                    title={`${color.name} · ${color.meaning}`}
                  />
                ))}
              </div>
              <p className="color-meaning">
                <span style={{ background: general.color }} />
                <strong>{colorInfo(general.color).name}</strong>
                <em>· {colorInfo(general.color).meaning} ·</em>
                会应用到侧边栏、列表头部、项目概览和完成度进度条。
              </p>
            </div>
            <div className="settings-footer-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner size={15} /> : null}保存更改
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除${deleteTarget?.kind === 'status' ? '状态' : '字段'}`}
        message={
          deleteTarget?.kind === 'status'
            ? `删除状态「${deleteTarget?.name || ''}」后，该状态下的任务会自动移动到其他状态。`
            : `删除字段「${deleteTarget?.name || ''}」后，所有任务中该字段的值将被清除。`
        }
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeTarget}
      />

      <ConfirmDialog
        open={Boolean(deleteAutomationTarget)}
        title="删除自动化规则"
        message={`确定删除「${deleteAutomationTarget?.name || ''}」吗？已产生的任务结果不会回滚。`}
        busy={automationBusy}
        onClose={() => setDeleteAutomationTarget(null)}
        onConfirm={removeAutomation}
      />
    </>
  );
}
