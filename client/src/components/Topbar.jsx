import { useState } from 'react';
import {
  Bell,
  ChevronRight,
  FileText,
  HelpCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { findDoc, findList } from '../lib/tree.js';
import { Avatar, IconButton, MenuDivider, MenuItem, Popover } from './ui.jsx';

export default function Topbar({ onOpenSidebar }) {
  const { bootstrap, route, navigate, openSearch, openCreateTask, openSettings, logout, toast } = useApp();
  const [helpOpen, setHelpOpen] = useState(false);
  const listInfo = route.type === 'list' ? findList(bootstrap?.spaces, route.id) : null;
  const doc = route.type === 'doc' ? findDoc(bootstrap?.docs, route.id) : null;
  const workspaceName = bootstrap?.workspace?.name || '工作空间';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn mobile-menu-btn" onClick={onOpenSidebar} aria-label="打开菜单">
          <Menu size={19} />
        </button>
        <div className="breadcrumbs">
          <button type="button" className="crumb-link" onClick={() => navigate('/home')}>
            {workspaceName}
          </button>
          {listInfo ? (
            <>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-muted">{listInfo.space.name}</span>
              {listInfo.folder && (
                <>
                  <ChevronRight size={13} className="crumb-sep" />
                  <span className="crumb-muted">{listInfo.folder.name}</span>
                </>
              )}
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">
                <span className="crumb-emoji">{listInfo.list.icon || '📋'}</span>
                {listInfo.list.name}
              </span>
            </>
          ) : route.type === 'home' ? (
            <>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">主页</span>
            </>
          ) : route.type === 'inbox' ? (
            <>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">收件箱</span>
            </>
          ) : route.type === 'portfolio' ? (
            <>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">项目组合</span>
            </>
          ) : route.type === 'doc' ? (
            <>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-muted">文档</span>
              <ChevronRight size={13} className="crumb-sep" />
              <span className="crumb-current">
                <FileText size={14} />
                {doc?.title || '文档'}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="topbar-right">
        <button type="button" className="topbar-search" onClick={openSearch}>
          <Search size={15} />
          <span>搜索</span>
          <kbd>⌘ K</kbd>
        </button>
        <IconButton label="搜索" className="topbar-icon-only" onClick={openSearch}>
          <Search size={18} />
        </IconButton>
        <button type="button" className="topbar-new" onClick={() => openCreateTask()}>
          <Plus size={15} />
          <span>新建任务</span>
        </button>
        <div className="topbar-divider" />
        <IconButton label="收件箱通知" className="topbar-bell" onClick={() => navigate('/inbox')}>
          <Bell size={18} />
          {bootstrap?.unread_count > 0 && <span className="bell-dot" />}
        </IconButton>
        <Popover
          width={220}
          align="right"
          trigger={
            <button type="button" className="topbar-user" aria-label="账户菜单">
              <Avatar user={bootstrap?.user} size={28} />
            </button>
          }
        >
          {({ close }) => (
            <>
              <div className="profile-pop-head">
                <Avatar user={bootstrap?.user} size={36} />
                <div>
                  <strong>{bootstrap?.user?.name}</strong>
                  <span>{bootstrap?.user?.email}</span>
                </div>
              </div>
              <MenuDivider />
              <MenuItem icon={<Settings size={15} />} onClick={() => { close(); openSettings('profile'); }}>
                个人设置
              </MenuItem>
              <MenuItem icon={<Settings size={15} />} onClick={() => { close(); openSettings('workspace'); }}>
                工作空间设置
              </MenuItem>
              <MenuItem icon={<UserPlus size={15} />} onClick={() => { close(); openSettings('members'); }}>
                邀请成员
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<LogOut size={15} />} danger onClick={logout}>
                退出登录
              </MenuItem>
            </>
          )}
        </Popover>
        <div className="topbar-help-wrap">
          <IconButton label="帮助" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={18} />
          </IconButton>
          {helpOpen && (
            <div className="help-popover">
              <div className="help-popover-head">
                <strong>快捷操作</strong>
                <button type="button" onClick={() => setHelpOpen(false)}>关闭</button>
              </div>
              <div className="help-row"><span>全局搜索</span><kbd>⌘ K</kbd></div>
              <div className="help-row"><span>新建任务</span><kbd>N</kbd></div>
              <div className="help-row"><span>关闭弹窗</span><kbd>Esc</kbd></div>
              <div className="help-note">所有数据保存在本机，可在「数据目录」中备份。</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
