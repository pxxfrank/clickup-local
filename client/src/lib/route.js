export function readRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return { type: 'home' };
  const [path, queryString = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  const params = new URLSearchParams(queryString);
  switch (segments[0]) {
    case 'list': {
      const view = params.get('view');
      return {
        type: 'list',
        id: segments[1],
        view: ['list', 'brainstorm', 'board', 'calendar', 'gantt', 'retrospective', 'overview'].includes(view) ? view : 'overview',
        task: params.get('task') || null,
      };
    }
    case 'doc':
      return { type: 'doc', id: segments[1] };
    case 'inbox':
      return { type: 'inbox' };
    case 'portfolio':
      return { type: 'portfolio' };
    case 'home':
      return { type: 'home' };
    default:
      return { type: 'notfound' };
  }
}
