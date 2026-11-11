import { Component } from 'react';
import { LogoMark } from './ui.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ClickUp] UI error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <LogoMark size={42} />
          <h1>页面遇到了一点问题</h1>
          <p>你的数据仍然安全地保存在本机。刷新页面通常可以继续工作。</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              刷新页面
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { window.location.hash = '/home'; window.location.reload(); }}>
              返回主页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
