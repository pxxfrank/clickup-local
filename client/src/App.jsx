import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { AppContext } from './context/AppContext.js';
import { readRoute } from './lib/route.js';
import LoginPage from './components/LoginPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import HomePage from './components/HomePage.jsx';
import InboxPage from './components/InboxPage.jsx';
import ListPage from './components/ListPage.jsx';
import DocPage from './components/DocPage.jsx';
import TaskDrawer from './components/TaskDrawer.jsx';
import SearchModal from './components/SearchModal.jsx';
import CreateTaskModal from './components/CreateTaskModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import WorkspaceOnboarding from './components/WorkspaceOnboarding.jsx';
import { LoadingScreen, ToastStack } from './components/ui.jsx';
import { findList } from './lib/tree.js';

export default function App() {
  const [bootstrap, setBootstrap] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [route, setRoute] = useState(readRoute);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [createDefaults, setCreateDefaults] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const bootstrapRef = useRef(null);
  const toastTimers = useRef(new Map());

  bootstrapRef.current = bootstrap;

  const toast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      toastTimers.current.delete(id);
    }, 4200);
    toastTimers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.current.delete(id);
  }, []);

  const navigate = useCallback((path) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    if (window.location.hash === `#${target}`) return;
    window.location.hash = target;
    setSidebarOpen(false);
  }, []);

  const loadBootstrap = useCallback(async (workspaceId, { silent = false } = {}) => {
    try {
      const data = await api.get('/bootstrap', workspaceId ? { workspaceId } : undefined);
      setBootstrap(data);
      if (!silent) setAuthLoading(false);
      return data;
    } catch (error) {
      if (error.status === 401) {
        setBootstrap(null);
        if (!silent) setAuthLoading(false);
        return null;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadBootstrap()
      .catch(() => {
        if (mounted) setBootstrap(null);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadBootstrap]);

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute());
      setSidebarOpen(false);
    }
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/home');
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route.type === 'list' && route.task) setDrawerTaskId(route.task);
  }, [route.type, route.task]);

  useEffect(() => {
    function onUnauthorized() {
      setBootstrap(null);
      setAuthLoading(false);
      setDrawerTaskId(null);
      setSearchOpen(false);
      setSettingsTab(null);
    }
    window.addEventListener('clickup:unauthorized', onUnauthorized);
    return () => window.removeEventListener('clickup:unauthorized', onUnauthorized);
  }, []);

  const openTask = useCallback((taskId) => setDrawerTaskId(taskId), []);
  const closeTask = useCallback(() => {
    setDrawerTaskId(null);
    const current = readRoute();
    if (current.type === 'list' && current.task) {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      params.delete('task');
      const query = params.toString();
      window.history.replaceState(null, '', `#/list/${current.id}${query ? `?${query}` : ''}`);
      setRoute(readRoute());
    }
  }, []);
  const openCreateTask = useCallback(
    (defaults = {}) => {
      const fallback = route.type === 'list' ? route.id : null;
      setCreateDefaults({ list_id: fallback, ...defaults });
    },
    [route]
  );
  const openSettings = useCallback((tab = 'profile') => setSettingsTab(tab), []);

  const refresh = useCallback(
    async ({ withBootstrap = true } = {}) => {
      setDataVersion((value) => value + 1);
      if (withBootstrap && bootstrapRef.current?.workspace?.id) {
        try {
          const data = await api.get('/bootstrap', { workspaceId: bootstrapRef.current.workspace.id });
          setBootstrap(data);
        } catch {
          // Keep the current UI; list-level refresh will surface errors separately.
        }
      }
    },
    []
  );

  const switchWorkspace = useCallback(
    async (workspaceId) => {
      const data = await loadBootstrap(workspaceId);
      if (data) {
        navigate('/home');
        setDrawerTaskId(null);
      }
    },
    [loadBootstrap, navigate]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Session may already be gone.
    }
    setBootstrap(null);
    setSidebarOpen(false);
  }, []);

  const handleAuthenticated = useCallback(async () => {
    const data = await loadBootstrap();
    if (data) {
      const current = readRoute();
      if (!data.workspace || !window.location.hash || (current.type === 'list' && !findList(data.spaces, current.id))) {
        navigate('/home');
      }
    }
  }, [loadBootstrap, navigate]);

  const handleWorkspaceCreated = useCallback(
    async (name) => {
      const created = await api.post('/workspaces', { name });
      const data = await loadBootstrap(created.id);
      if (!data?.workspace) throw new Error('工作空间创建失败，请重试');
      navigate('/home');
    },
    [loadBootstrap, navigate]
  );

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'n' && !drawerTaskId) {
        event.preventDefault();
        openCreateTask();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCreateTask, drawerTaskId]);

  useEffect(() => {
    if (!bootstrap) return;
    const list = route.type === 'list' ? findList(bootstrap.spaces, route.id) : null;
    if (route.type === 'list') {
      document.title = list ? `${list.list.name} · ClickUp 本地版` : 'ClickUp 本地版';
    } else if (route.type === 'home') {
      document.title = '主页 · ClickUp 本地版';
    } else if (route.type === 'inbox') {
      document.title = '收件箱 · ClickUp 本地版';
    } else if (route.type === 'doc') {
      document.title = `${bootstrap.docs?.find((doc) => doc.id === route.id)?.title || '文档'} · ClickUp 本地版`;
    }
  }, [bootstrap, route]);

  const contextValue = useMemo(
    () => ({
      bootstrap,
      user: bootstrap?.user,
      route,
      navigate,
      refresh,
      refreshBootstrap: refresh,
      dataVersion,
      toast,
      openTask,
      closeTask,
      openCreateTask,
      openSettings,
      openSearch: () => setSearchOpen(true),
      switchWorkspace,
      logout,
    }),
    [bootstrap, route, navigate, refresh, dataVersion, toast, openTask, closeTask, openCreateTask, openSettings, switchWorkspace, logout]
  );

  if (authLoading) return <LoadingScreen label="正在打开你的工作空间…" />;
  if (!bootstrap) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }
  if (!bootstrap.workspace) {
    return <WorkspaceOnboarding user={bootstrap.user} onCreate={handleWorkspaceCreated} onLogout={logout} />;
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main-area">
          <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="page-scroll">
            {route.type === 'home' && <HomePage />}
            {route.type === 'inbox' && <InboxPage />}
            {route.type === 'list' && (
              <ListPage
                key={route.id}
                listId={route.id}
                view={route.view || 'list'}
                onViewChange={(view) => navigate(`/list/${route.id}?view=${view}`)}
              />
            )}
            {route.type === 'doc' && <DocPage docId={route.id} key={route.id} />}
            {!['home', 'inbox', 'list', 'doc'].includes(route.type) && (
              <div className="page-not-found">
                <h2>页面不存在</h2>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/home')}>
                  返回主页
                </button>
              </div>
            )}
          </main>
        </div>
      </div>

      <TaskDrawer taskId={drawerTaskId} onClose={closeTask} onOpenTask={setDrawerTaskId} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CreateTaskModal defaults={createDefaults} onClose={() => setCreateDefaults(null)} />
      <SettingsModal open={Boolean(settingsTab)} initialTab={settingsTab || 'profile'} onClose={() => setSettingsTab(null)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}
