import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  Home,
  Boxes,
  Inbox,
  LayoutTemplate,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { PROJECT_COLORS, colorInfo } from '../lib/colors.js';

import {
  Avatar,
  ConfirmDialog,
  IconButton,
  Logo,
  MenuDivider,
  MenuItem,
  MenuLabel,
  Modal,
  Popover,
  Spinner,
} from './ui.jsx';

const ICONS = ['🚀', '📣', '🏡', '💼', '🎯', '🧠', '📦', '🌱', '⚡️', '🛠️'];
const LIST_ICONS = ['📋', '🏃', '🐞', '📄', '💻', '🎨', '🔬', '✍️', '🎪', '📈', '🤝', '👋', '📌', '🧪'];

export default function Sidebar({ open, onClose }) {
  const app = useApp();
  const { bootstrap, route, navigate, refreshBootstrap, switchWorkspace, openSettings, openSearch, toast, user } = app;
  const [collapsedSpaces, setCollapsedSpaces] = useState(() => new Set());
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [itemModal, setItemModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [workspaceModal, setWorkspaceModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const spaces = bootstrap?.spaces || [];
  const docs = bootstrap?.docs || [];
  const templates = bootstrap?.templates || [];
  const workspace = bootstrap?.workspace;
  const activeListId = route.type === 'list' ? route.id : null;
  const activeDocId = route.type === 'doc' ? route.id : null;

  useEffect(() => {
    onClose?.();
  }, [route.type, route.id]);

  function toggleSpace(id) {
    setCollapsedSpaces((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFolder(id) {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createDoc() {
    try {
      const doc = await api.post('/docs', { workspace_id: workspace.id, title: '无标题文档', content: '' });
      await refreshBootstrap();
      navigate(`/doc/${doc.id}`);
      onClose?.();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function submitItem(event) {
    event.preventDefault();
    const { kind, space, folder, item } = itemModal;
    const name = itemModal.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (kind === 'rename') {
        const targetType = itemModal.type;
        const path =
          targetType === 'space'
            ? `/spaces/${item.id}`
            : targetType === 'folder'
              ? `/folders/${item.id}`
              : `/lists/${item.id}`;
        const patch = { name };
        if (targetType === 'space') {
          patch.icon = itemModal.icon;
          patch.color = itemModal.color;
        }
        await api.patch(path, patch);
        await refreshBootstrap();
      } else if (kind === 'space') {
        await api.post('/spaces', {
          workspace_id: workspace.id,
          name,
          color: itemModal.color,
          icon: itemModal.icon,
        });
        await refreshBootstrap();
      } else if (kind === 'folder') {
        await api.post('/folders', { space_id: space.id, name });
        await refreshBootstrap();
      } else if (kind === 'list') {
        const created = await api.post('/lists', {
          space_id: space.id,
          folder_id: folder?.id || null,
          name,
          color: itemModal.color,
          icon: itemModal.icon,
        });
        await refreshBootstrap();
        navigate(`/list/${created.id}`);
      } else if (kind === 'template') {
        if (!itemModal.templateId) throw new Error('请选择一个项目模板');
        const created = await api.post(`/templates/${itemModal.templateId}/instantiate`, {
          space_id: space.id,
          folder_id: folder?.id || null,
          name,
        });
        await refreshBootstrap();
        navigate(`/list/${created.list.id}`);
        toast(`已从模板创建「${created.list.name}」`);
      }
      setItemModal(null);
      if (kind !== 'template') toast(kind === 'rename' ? '已保存修改' : '创建成功');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const path =
        deleteTarget.type === 'space'
          ? `/spaces/${deleteTarget.id}`
          : deleteTarget.type === 'folder'
            ? `/folders/${deleteTarget.id}`
            : `/lists/${deleteTarget.id}`;
      await api.delete(path);
      setDeleteTarget(null);
      if (deleteTarget.type !== 'list' || activeListId === deleteTarget.id) {
        if (activeListId) navigate('/home');
      }
      await refreshBootstrap();
      toast('已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(event) {
    event.preventDefault();
    if (!workspaceModalName.trim()) return;
    setBusy(true);
    try {
      const created = await api.post('/workspaces', { name: workspaceModalName.trim() });
      setWorkspaceModal(false);
      setWorkspaceModalName('');
      await switchWorkspace(created.id);
      toast(`已切换到「${created.name}」`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const [workspaceModalName, setWorkspaceModalName] = useState('');

  function openCreate(kind, space = null, folder = null) {
    const templates = bootstrap?.templates || [];
    const firstTemplate = kind === 'template' ? templates[0] : null;
    setItemModal({
      kind,
      space,
      folder,
      name: firstTemplate ? firstTemplate.name.replace(/模板$/, '').trim() : '',
      templateId: firstTemplate?.id || '',
      color: functionColor(kind, space),
      icon: kind === 'space' ? '🚀' : kind === 'list' ? '📋' : '',
    });
  }

  function functionColor(kind, space) {
    if (kind === 'folder') return space?.color || '#7B68EE';
    return '#7B68EE';
  }

  function openRename(item, type) {
    setItemModal({ kind: 'rename', item, name: item.name, type, color: item.color, icon: item.icon });
  }

  function listMenu(list, space, folder) {
    return (
      <Popover
        width={190}
        align="right"
        trigger={
          <span className="tree-more" onClick={(event) => event.stopPropagation()}>
            <MoreHorizontal size={14} />
          </span>
        }
      >
        {({ close }) => (
          <>
            <MenuItem
              icon={<FileText size={15} />}
              onClick={() => {
                close();
                openCreate('list', space, folder);
              }}
            >
              在「{folder?.name || space.name}」中新建列表
            </MenuItem>
            <MenuItem
              icon={<Settings size={15} />}
              onClick={() => {
                close();
                openRename(list, 'list');
              }}
            >
              重命名列表
            </MenuItem>
            <MenuDivider />
            <MenuItem
              danger
              onClick={() => {
                close();
                setDeleteTarget({ type: 'list', id: list.id, name: list.name });
              }}
            >
              删除列表
            </MenuItem>
          </>
        )}
      </Popover>
    );
  }

  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'is-visible' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-head">
          <Logo />
          <div className="sidebar-head-actions">
            <IconButton label="关闭侧栏" className="sidebar-close" onClick={onClose}>
              <X size={17} />
            </IconButton>
            <IconButton label="收起侧栏" className="sidebar-collapse-desktop" onClick={onClose}>
              <PanelLeftClose size={17} />
            </IconButton>
          </div>
        </div>

        <Popover
          width={270}
          className="ws-switcher"
          menuClassName="ws-menu"
          trigger={
            <button type="button" className="ws-switcher-btn">
              <span className="ws-avatar" style={{ background: workspace?.color || '#7B68EE' }}>
                {workspace?.name?.slice(0, 1) || 'W'}
              </span>
              <span className="ws-switcher-text">
                <strong>{workspace?.name || '工作空间'}</strong>
                <span>{bootstrap?.members?.length || 0} 位成员 · 本地</span>
              </span>
              <ChevronDown size={15} />
            </button>
          }
        >
          {({ close }) => (
            <>
              <MenuLabel>工作空间</MenuLabel>
              {(bootstrap?.workspaces || []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`ws-option ${item.id === workspace?.id ? 'is-active' : ''}`}
                  onClick={async () => {
                    close();
                    if (item.id !== workspace?.id) await switchWorkspace(item.id);
                  }}
                >
                  <span className="ws-avatar ws-avatar-sm" style={{ background: item.color }}>
                    {item.name.slice(0, 1)}
                  </span>
                  <span className="ws-option-text">
                    <strong>{item.name}</strong>
                    <span>{item.role === 'owner' ? '所有者' : item.role === 'admin' ? '管理员' : '成员'}</span>
                  </span>
                  {item.id === workspace?.id && <span className="ws-check">✓</span>}
                </button>
              ))}
              <MenuDivider />
              <MenuItem icon={<Plus size={15} />} onClick={() => { close(); setWorkspaceModal(true); }}>
                新建工作空间
              </MenuItem>
              <MenuItem
                icon={<Settings size={15} />}
                onClick={() => {
                  close();
                  openSettings('workspace');
                }}
              >
                编辑 / 删除工作空间
              </MenuItem>
            </>
          )}
        </Popover>

        <div className="sidebar-utility">
          <button type="button" className="sidebar-search" onClick={openSearch}>
            <Search size={16} />
            <span>搜索</span>
            <kbd>⌘ K</kbd>
          </button>
          <button type="button" className={`sidebar-nav ${route.type === 'home' ? 'is-active' : ''}`} onClick={() => navigate('/home')}>
            <Home size={17} />
            <span>主页</span>
          </button>
          <button type="button" className={`sidebar-nav ${route.type === 'inbox' ? 'is-active' : ''}`} onClick={() => navigate('/inbox')}>
            <Inbox size={17} />
            <span>收件箱</span>
            {bootstrap?.unread_count > 0 && (
              <span className="nav-badge">{bootstrap.unread_count > 99 ? '99+' : bootstrap.unread_count}</span>
            )}
          </button>
          <button type="button" className={`sidebar-nav ${route.type === 'portfolio' ? 'is-active' : ''}`} onClick={() => navigate('/portfolio')}>
            <Boxes size={17} />
            <span>项目组合</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section-head">
            <span>空间</span>
            <IconButton label="新建空间" onClick={() => openCreate('space')}>
              <Plus size={16} />
            </IconButton>
          </div>

          <div className="tree">
            {spaces.map((space) => {
              const collapsed = collapsedSpaces.has(space.id);
              return (
                <div className="tree-space" key={space.id}>
                  <div
                    className={`tree-row tree-space-row ${collapsed ? 'is-collapsed' : ''}`}
                    style={{ '--space-color': space.color || '#7B68EE' }}
                  >
                    <button type="button" className="tree-chevron" onClick={() => toggleSpace(space.id)} aria-label="展开空间">
                      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button type="button" className="tree-space-main" onClick={() => toggleSpace(space.id)}>
                      <span
                        className="tree-space-icon"
                        style={{ background: `${space.color || '#7B68EE'}26`, borderColor: `${space.color || '#7B68EE'}55` }}
                      >
                        {space.icon || '🚀'}
                      </span>
                      <span className="tree-label">{space.name}</span>
                    </button>
                    <Popover
                      width={205}
                      align="right"
                      trigger={
                        <span className="tree-more" title="空间操作">
                          <MoreHorizontal size={14} />
                        </span>
                      }
                    >
                      {({ close }) => (
                        <>
                          <MenuLabel>空间操作</MenuLabel>
                          <MenuItem icon={<Plus size={15} />} onClick={() => { close(); openCreate('list', space, null); }}>
                            新建列表
                          </MenuItem>
                          <MenuItem icon={<FolderIcon size={15} />} onClick={() => { close(); openCreate('folder', space, null); }}>
                            新建文件夹
                          </MenuItem>
                          <MenuItem icon={<LayoutTemplate size={15} />} onClick={() => { close(); openCreate('template', space, null); }}>
                            从模板创建项目
                          </MenuItem>
                          <MenuDivider />
                          <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); openRename(space, 'space'); }}>
                            编辑空间
                          </MenuItem>
                          <MenuItem danger icon={<Trash2 size={15} />} onClick={() => { close(); setDeleteTarget({ type: 'space', id: space.id, name: space.name }); }}>
                            删除空间
                          </MenuItem>
                        </>
                      )}
                    </Popover>
                  </div>

                  {!collapsed && (
                    <div className="tree-children">
                      {(space.folders || []).map((folder) => {
                        const folderCollapsed = collapsedFolders.has(folder.id);
                        return (
                          <div className="tree-folder" key={folder.id}>
                            <div className="tree-row tree-folder-row">
                              <button type="button" className="tree-chevron" onClick={() => toggleFolder(folder.id)} aria-label="展开文件夹">
                                {folderCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                              </button>
                              <button type="button" className="tree-folder-main" onClick={() => toggleFolder(folder.id)}>
                                <FolderIcon size={14} className="folder-icon" />
                                <span className="tree-label">{folder.name}</span>
                              </button>
                              <Popover
                                width={200}
                                align="right"
                                trigger={
                                  <span className="tree-more" title="文件夹操作">
                                    <MoreHorizontal size={14} />
                                  </span>
                                }
                              >
                                {({ close }) => (
                                  <>
                                    <MenuItem icon={<Plus size={15} />} onClick={() => { close(); openCreate('list', space, folder); }}>
                                      新建列表
                                    </MenuItem>
                                    <MenuItem icon={<LayoutTemplate size={15} />} onClick={() => { close(); openCreate('template', space, folder); }}>
                                      从模板创建项目
                                    </MenuItem>
                                    <MenuItem icon={<Settings size={15} />} onClick={() => { close(); openRename(folder, 'folder'); }}>
                                      重命名文件夹
                                    </MenuItem>
                                    <MenuItem danger onClick={() => { close(); setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }); }}>
                                      删除文件夹
                                    </MenuItem>
                                  </>
                                )}
                              </Popover>
                            </div>
                            {!folderCollapsed &&
                              (folder.lists || []).map((list) => (
                                <div
                                  className={`tree-row tree-list-row ${activeListId === list.id ? 'is-active' : ''}`}
                                  key={list.id}
                                  style={{
                                    '--list-color': list.color || '#7B68EE',
                                    background: activeListId === list.id ? `${list.color || '#7B68EE'}38` : undefined,
                                    boxShadow: activeListId === list.id ? `inset 2px 0 0 ${list.color || '#7B68EE'}` : undefined,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="tree-list-main"
                                    onClick={() => navigate(`/list/${list.id}`)}
                                  >
                                    <span
                                      className="list-emoji"
                                      style={{ background: `${list.color || '#7B68EE'}24`, borderColor: `${list.color || '#7B68EE'}55` }}
                                    >
                                      {list.icon || '📋'}
                                    </span>
                                    <span className="tree-label">{list.name}</span>
                                    {list.task_count > 0 && <span className="tree-count">{list.task_count}</span>}
                                  </button>
                                  {listMenu(list, space, folder)}
                                </div>
                              ))}
                          </div>
                        );
                      })}
                      {(space.lists || []).map((list) => (
                        <div
                          className={`tree-row tree-list-row ${activeListId === list.id ? 'is-active' : ''}`}
                          key={list.id}
                          style={{
                            '--list-color': list.color || '#7B68EE',
                            background: activeListId === list.id ? `${list.color || '#7B68EE'}38` : undefined,
                            boxShadow: activeListId === list.id ? `inset 2px 0 0 ${list.color || '#7B68EE'}` : undefined,
                          }}
                        >
                          <button type="button" className="tree-list-main" onClick={() => navigate(`/list/${list.id}`)}>
                            <span
                              className="list-emoji"
                              style={{ background: `${list.color || '#7B68EE'}24`, borderColor: `${list.color || '#7B68EE'}55` }}
                            >
                              {list.icon || '📋'}
                            </span>
                            <span className="tree-label">{list.name}</span>
                            {list.task_count > 0 && <span className="tree-count">{list.task_count}</span>}
                          </button>
                          {listMenu(list, space, null)}
                        </div>
                      ))}
                      {!space.folders?.length && !space.lists?.length && (
                        <button type="button" className="tree-empty-add" onClick={() => openCreate('list', space)}>
                          <Plus size={13} /> 新建列表
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!spaces.length && (
              <button type="button" className="tree-empty-add" onClick={() => openCreate('space')}>
                <Plus size={13} /> 创建第一个空间
              </button>
            )}
          </div>

          <div className="sidebar-section-head docs-head">
            <span>文档</span>
            <IconButton label="新建文档" onClick={createDoc}>
              <Plus size={16} />
            </IconButton>
          </div>
          <div className="sidebar-docs">
            {docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`sidebar-doc ${activeDocId === doc.id ? 'is-active' : ''}`}
                onClick={() => navigate(`/doc/${doc.id}`)}
              >
                <FileText size={14} />
                <span>{doc.title}</span>
              </button>
            ))}
            {!docs.length && (
              <button type="button" className="sidebar-doc sidebar-doc-empty" onClick={createDoc}>
                <Sparkles size={14} /> 创建第一篇文档
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-foot">
          <button type="button" className="invite-btn" onClick={() => openSettings('members')}>
            <UserPlus size={15} />
            邀请成员
          </button>
          <div className="sidebar-user-row">
            <button type="button" className="sidebar-user" onClick={() => openSettings('profile')}>
              <Avatar user={user} size={28} />
              <span className="sidebar-user-text">
                <strong>{user?.name}</strong>
                <span>{bootstrap?.role === 'owner' ? '所有者' : bootstrap?.role === 'admin' ? '管理员' : '成员'}</span>
              </span>
            </button>
            <IconButton label="设置" onClick={() => openSettings('workspace')}>
              <Settings size={16} />
            </IconButton>
          </div>
          <div className="sidebar-version">ClickUp Local v1.6 · 数据保存在本机</div>
        </div>
      </aside>

      <Modal
        open={Boolean(itemModal)}
        onClose={() => setItemModal(null)}
        title={
          itemModal?.kind === 'space'
            ? '新建空间'
            : itemModal?.kind === 'folder'
              ? '新建文件夹'
              : itemModal?.kind === 'list'
                ? '新建列表'
                : itemModal?.kind === 'template'
                  ? '从模板创建项目'
                  : itemModal?.type === 'space'
                    ? '编辑空间'
                    : '重命名'
        }
        subtitle={
          itemModal?.kind === 'template'
            ? '复用已有项目的任务、工作流、字段和里程碑'
            : itemModal?.kind === 'rename'
              ? itemModal?.type === 'space'
                ? '修改空间的名称、图标和颜色'
                : '修改名称后立即生效'
              : '空间用于组织团队，文件夹和列表用于组织工作'
        }
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setItemModal(null)}>
              取消
            </button>
            <button
              type="submit"
              form="tree-item-form"
              className="btn btn-primary"
              disabled={busy || (itemModal?.kind === 'template' && !itemModal?.templateId)}
            >
              {busy ? <Spinner size={15} /> : null}
              {itemModal?.kind === 'rename' ? '保存' : itemModal?.kind === 'template' ? '创建项目' : '创建'}
            </button>
          </>
        }
      >
        {itemModal && (
          <form id="tree-item-form" className="stack" onSubmit={submitItem}>
            {itemModal.kind === 'template' && (
              <div className="field">
                <span className="field-label">项目模板</span>
                {templates.length ? (
                  <div className="template-picker">
                    {templates.map((template) => (
                      <button
                        type="button"
                        key={template.id}
                        className={`template-choice ${itemModal.templateId === template.id ? 'is-active' : ''}`}
                        onClick={() =>
                          setItemModal({
                            ...itemModal,
                            templateId: template.id,
                            name: template.name.replace(/模板$/, '').trim() || itemModal.name,
                          })
                        }
                      >
                        <span className="template-choice-icon">{template.icon || '📋'}</span>
                        <span>
                          <strong>{template.name}</strong>
                          <em>包含任务、工作流、字段与里程碑</em>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="template-empty-note">
                    还没有项目模板。打开一个现有项目，在右上角「⋯」菜单中选择「另存为项目模板」。
                  </div>
                )}
              </div>
            )}
            <label className="field">
              <span className="field-label">{itemModal.kind === 'template' ? '新项目名称' : '名称'}</span>
              <input
                className="input"
                autoFocus
                value={itemModal.name}
                onChange={(event) => setItemModal({ ...itemModal, name: event.target.value })}
                placeholder={
                  itemModal.kind === 'space' || (itemModal.kind === 'rename' && itemModal.type === 'space')
                    ? '例如：产品研发'
                    : itemModal.kind === 'folder'
                      ? '例如：移动端 App'
                      : itemModal.kind === 'template'
                        ? '例如：2027 春季活动'
                        : '例如：迭代计划'
                }
              />
            </label>
            {(itemModal.kind === 'space' ||
              itemModal.kind === 'list' ||
              (itemModal.kind === 'rename' && itemModal.type === 'space')) && (
              <>
                <div className="field">
                  <span className="field-label">图标</span>
                  <div className="emoji-picker">
                    {(itemModal.kind === 'space' || itemModal.type === 'space' ? ICONS : LIST_ICONS).map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        className={`emoji-option ${itemModal.icon === icon ? 'is-active' : ''}`}
                        onClick={() => setItemModal({ ...itemModal, icon })}
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
                        className={`color-option ${itemModal.color === color.value ? 'is-active' : ''}`}
                        style={{ background: color.value }}
                        onClick={() => setItemModal({ ...itemModal, color: color.value })}
                        aria-label={`${color.name} · ${color.meaning}`}
                        title={`${color.name} · ${color.meaning}`}
                      />
                    ))}
                  </div>
                  <p className="color-meaning">
                    <span style={{ background: itemModal.color }} />
                    <strong>{colorInfo(itemModal.color).name}</strong>
                    <em>· {colorInfo(itemModal.color).meaning} ·</em>
                    {itemModal.kind === 'space' || itemModal.type === 'space'
                      ? '会应用到空间图标、左侧标识和侧边栏。'
                      : '会应用到侧边栏图标、活动标识、列表头部和完成度进度条。'}
                  </p>
                </div>
              </>
            )}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除${deleteTarget?.type === 'space' ? '空间' : deleteTarget?.type === 'folder' ? '文件夹' : '列表'}`}
        message={
          deleteTarget?.type === 'space'
            ? `删除「${deleteTarget.name}」将同时删除其中的所有文件夹、列表和任务，此操作无法撤销。`
            : deleteTarget?.type === 'folder'
              ? `删除「${deleteTarget.name}」将同时删除其中的列表和任务，此操作无法撤销。`
              : `删除「${deleteTarget?.name}」将同时删除其中的所有任务，此操作无法撤销。`
        }
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeItem}
      />

      <Modal
        open={workspaceModal}
        onClose={() => setWorkspaceModal(false)}
        title="新建工作空间"
        subtitle="为另一个团队或项目创建独立的工作空间"
        width={440}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setWorkspaceModal(false)}>
              取消
            </button>
            <button type="submit" form="workspace-form" className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner size={15} /> : null}
              创建
            </button>
          </>
        }
      >
        <form id="workspace-form" className="stack" onSubmit={createWorkspace}>
          <label className="field">
            <span className="field-label">工作空间名称</span>
            <input
              className="input"
              autoFocus
              value={workspaceModalName}
              onChange={(event) => setWorkspaceModalName(event.target.value)}
              placeholder="例如：设计团队"
            />
          </label>
        </form>
      </Modal>
    </>
  );
}
