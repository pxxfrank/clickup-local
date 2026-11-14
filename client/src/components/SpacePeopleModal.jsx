import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { Avatar, Modal, Spinner } from './ui.jsx';

export default function SpacePeopleModal({ open, space, onClose }) {
  const { bootstrap, toast } = useApp();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const assignable = bootstrap?.assignees || bootstrap?.members || [];

  async function loadPeople() {
    if (!space?.id) return;
    setLoading(true);
    try {
      const data = await api.get(`/spaces/${space.id}/people`);
      setPeople(data.people || []);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !space?.id) return;
    setSelectedUserId('');
    loadPeople();
  }, [open, space?.id]);

  const available = useMemo(
    () => assignable.filter((person) => !people.some((item) => item.id === person.id)),
    [assignable, people]
  );

  async function addPerson() {
    if (!selectedUserId || adding) return;
    setAdding(true);
    try {
      await api.post(`/spaces/${space.id}/people`, { user_id: selectedUserId });
      setSelectedUserId('');
      await loadPeople();
      toast('相关人已添加');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function removePerson(person) {
    setDeletingId(person.id);
    try {
      await api.delete(`/spaces/${space.id}/people/${person.id}`);
      await loadPeople();
      toast('相关人已移除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="空间相关人"
      subtitle={space ? `${space.name} · 统一管理这个空间的任务相关人` : ''}
      width={540}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>}
    >
      <div className="space-people-modal">
        <div className="space-people-add">
          <select
            className="input"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">选择工作空间成员或外部责任人</option>
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}{person.is_external ? '（外部）' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={addPerson} disabled={!selectedUserId || adding}>
            {adding ? <Spinner size={13} /> : <Plus size={13} />} 添加
          </button>
        </div>
        <p className="space-people-hint">
          <Users size={12} /> 任务相关人从这里统一选择；已被任务使用的相关人不能删除。
        </p>
        {loading ? (
          <div className="space-people-loading"><Spinner size={17} /> 正在读取相关人…</div>
        ) : people.length ? (
          <div className="space-people-list">
            {people.map((person) => (
              <div className="space-person-row" key={person.id}>
                <Avatar user={person} size={28} />
                <div className="space-person-main">
                  <strong>{person.name}</strong>
                  <span>{person.title || (person.is_external ? '外部责任人' : '空间成员')}</span>
                </div>
                {person.is_external && <span className="space-person-badge">外部</span>}
                <button
                  type="button"
                  className="space-person-delete"
                  onClick={() => removePerson(person)}
                  disabled={deletingId === person.id}
                  title="从空间相关人移除"
                >
                  {deletingId === person.id ? <Spinner size={12} /> : <Trash2 size={13} />} 删除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-people-empty">还没有相关人。可以从上方添加空间成员或外部责任人。</div>
        )}
      </div>
    </Modal>
  );
}
