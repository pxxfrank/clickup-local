import { hashPassword, randomId } from './security.js';

const USER_COLORS = {
  lin: '#7B68EE',
  chen: '#26C6DA',
  su: '#FF8A65',
  zhou: '#66BB6A',
};

const TAGS = [
  ['前端', '#61bd8f'],
  ['后端', '#5b8def'],
  ['设计', '#f78fb3'],
  ['P0', '#e5484d'],
  ['增长', '#f2a93b'],
  ['客户反馈', '#9b7ede'],
  ['文档', '#8898aa'],
];

function day(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

export function seedDatabase(db) {
  const now = new Date().toISOString();
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, password_salt, color, title, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  const insertWorkspace = db.prepare(
    'INSERT INTO workspaces (id, name, color, owner_id, created_at) VALUES (?,?,?,?,?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)'
  );
  const insertSpace = db.prepare(
    'INSERT INTO spaces (id, workspace_id, name, color, icon, is_private, order_index, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  const insertFolder = db.prepare(
    'INSERT INTO folders (id, space_id, name, order_index, created_at) VALUES (?,?,?,?,?)'
  );
  const insertList = db.prepare(
    'INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, order_index, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  const insertStatus = db.prepare(
    'INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)'
  );
  const insertTag = db.prepare('INSERT INTO tags (id, workspace_id, name, color) VALUES (?,?,?,?)');
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, list_id, parent_id, name, description, status_id, priority, assignee_id, start_date, due_date, time_estimate, order_index, created_by, created_at, updated_at, completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const insertTaskTag = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?,?)');
  const insertChecklist = db.prepare(
    'INSERT INTO checklists (id, task_id, name, order_index) VALUES (?,?,?,?)'
  );
  const insertChecklistItem = db.prepare(
    'INSERT INTO checklist_items (id, checklist_id, name, done, order_index) VALUES (?,?,?,?,?)'
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)'
  );
  const insertActivity = db.prepare(
    'INSERT INTO activity (id, workspace_id, task_id, user_id, type, message, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  const insertField = db.prepare(
    'INSERT INTO custom_fields (id, list_id, name, type, options, order_index) VALUES (?,?,?,?,?,?)'
  );
  const insertFieldValue = db.prepare(
    'INSERT INTO task_field_values (task_id, field_id, value) VALUES (?,?,?)'
  );
  const insertDoc = db.prepare(
    'INSERT INTO docs (id, workspace_id, title, content, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
  );
  const insertRead = db.prepare(
    'INSERT INTO workspace_reads (workspace_id, user_id, last_read_at) VALUES (?,?,?)'
  );

  db.exec('BEGIN');
  try {
    const users = {};
    const spec = [
      ['lin', '林晓', 'demo@clickup.local', '产品负责人', 'owner'],
      ['chen', '陈墨', 'chen@clickup.local', '技术负责人', 'admin'],
      ['su', '苏晴', 'su@clickup.local', '内容与增长', 'member'],
      ['zhou', '周屿', 'zhou@clickup.local', '产品设计师', 'member'],
    ];
    for (const [key, name, email, title, role] of spec) {
      const id = randomId();
      const { hash, salt } = hashPassword('demo1234');
      insertUser.run(id, name, email, hash, salt, USER_COLORS[key], title, now);
      users[key] = id;
    }

    const workspaceId = randomId();
    insertWorkspace.run(workspaceId, '星野科技', '#7B68EE', users.lin, now);
    insertMember.run(workspaceId, users.lin, 'owner', now);
    insertMember.run(workspaceId, users.chen, 'admin', now);
    insertMember.run(workspaceId, users.su, 'member', now);
    insertMember.run(workspaceId, users.zhou, 'member', now);
    for (const userKey of ['lin', 'chen', 'su', 'zhou']) {
      insertRead.run(workspaceId, users[userKey], minutesAgo(240));
    }

    const tagIds = {};
    for (const [name, color] of TAGS) {
      const id = randomId();
      insertTag.run(id, workspaceId, name, color);
      tagIds[name] = id;
    }

    const spaces = {};
    const folders = {};
    const lists = {};
    const statuses = {};

    function makeSpace(key, name, color, icon) {
      const id = randomId();
      insertSpace.run(id, workspaceId, name, color, icon, 0, Object.keys(spaces).length, now);
      spaces[key] = { id, name, color };
      return id;
    }
    function makeFolder(key, spaceKey, name) {
      const id = randomId();
      insertFolder.run(id, spaces[spaceKey].id, name, Object.keys(folders).length, now);
      folders[key] = { id, name };
      return id;
    }
    function makeList(key, spaceKey, folderKey, name, color, icon, description, workflow = 'default') {
      const id = randomId();
      insertList.run(
        id,
        spaces[spaceKey].id,
        folderKey ? folders[folderKey].id : null,
        name,
        color,
        icon,
        description,
        Object.keys(lists).length,
        now
      );
      const workflows = {
        default: [
          ['待处理', '#87909e', 'open'],
          ['进行中', '#4a9eff', 'active'],
          ['审核中', '#a25ddc', 'active'],
          ['已完成', '#2ea44f', 'done'],
          ['已关闭', '#6b7280', 'closed'],
        ],
        bug: [
          ['待复现', '#87909e', 'open'],
          ['修复中', '#e5484d', 'active'],
          ['待验证', '#f59e0b', 'active'],
          ['已解决', '#2ea44f', 'done'],
          ['不修复', '#6b7280', 'closed'],
        ],
        content: [
          ['选题', '#87909e', 'open'],
          ['撰写中', '#4a9eff', 'active'],
          ['审核中', '#a25ddc', 'active'],
          ['已发布', '#2ea44f', 'done'],
          ['已暂停', '#6b7280', 'closed'],
        ],
        hiring: [
          ['新简历', '#87909e', 'open'],
          ['初筛', '#4a9eff', 'active'],
          ['面试', '#a25ddc', 'active'],
          ['Offer', '#f59e0b', 'active'],
          ['已入职', '#2ea44f', 'done'],
        ],
      };
      statuses[key] = workflows[workflow].map(([sName, sColor, type], index) => {
        const sid = randomId();
        insertStatus.run(sid, id, sName, sColor, type, index);
        return { id: sid, name: sName, color: sColor, type };
      });
      lists[key] = { id, name, color, icon };
      return id;
    }

    makeSpace('product', '产品研发', '#7B68EE', '🚀');
    makeSpace('growth', '市场增长', '#FF8A65', '📣');
    makeSpace('ops', '团队运营', '#26A69A', '🏡');

    makeFolder('app', 'product', '移动端 App');
    makeFolder('web', 'product', 'Web 平台');

    makeList('sprint', 'product', 'app', '迭代计划', '#7B68EE', '🏃', 'S24 迭代的任务与发布节奏', 'default');
    makeList('bugs', 'product', 'app', '缺陷跟踪', '#e5484d', '🐞', '线上与测试环境缺陷', 'bug');
    makeList('prd', 'product', 'app', '产品需求', '#4a9eff', '📄', '需求池与产品文档', 'default');
    makeList('frontend', 'product', 'web', '前端开发', '#5b8def', '💻', 'Web 平台前端工作流', 'default');
    makeList('design', 'product', 'web', '设计走查', '#a25ddc', '🎨', '视觉与交互验收', 'default');
    makeList('research', 'product', null, '技术调研', '#26a69a', '🔬', '技术选型与预研', 'default');
    makeList('content', 'growth', null, '内容日历', '#f2a93b', '✍️', '博客、公众号与视频内容', 'content');
    makeList('events', 'growth', null, '活动执行', '#ff8a65', '🎪', '线上线下活动筹备', 'default');
    makeList('growth', 'growth', null, '增长实验', '#61bd8f', '📈', '留存与转化实验', 'default');
    makeList('hiring', 'ops', null, '招聘流程', '#4db6ac', '🤝', '候选人跟进与面试', 'hiring');
    makeList('onboarding', 'ops', null, '新人入职', '#8898aa', '👋', '入职准备与培训', 'default');

    const fields = {};

    function addField(listKey, name, type, options = []) {
      const id = randomId();
      insertField.run(id, lists[listKey].id, name, type, JSON.stringify(options), Object.keys(fields).length);
      fields[`${listKey}:${name}`] = id;
      return id;
    }

    addField('sprint', '故事点', 'number');
    addField('sprint', '迭代', 'select', ['S24', 'S25']);
    addField('bugs', '严重程度', 'select', ['致命', '严重', '一般', '轻微']);
    addField('bugs', '影响版本', 'text');
    addField('bugs', '复现概率', 'select', ['必现', '高频', '偶现']);
    addField('prd', '需求类型', 'select', ['新功能', '体验优化', '技术需求']);
    addField('prd', '目标版本', 'select', ['v2.4', 'v2.5', 'v3.0']);
    addField('content', '发布渠道', 'select', ['公众号', '官网博客', '视频号', '小红书']);

    const listTaskCounts = {};
    const createdTasks = [];

    function addTask(listKey, options) {
      const {
        name,
        status = 0,
        assignee = 'lin',
        priority = 0,
        due = null,
        start = null,
        description = '',
        tags = [],
        parent = null,
        subtasks = [],
        checklist = null,
        comments = [],
        fields: fieldValues = {},
        createdMinutesAgo = 60 * 24 * 7,
        estimate = null,
      } = options;
      const id = randomId();
      const createdAt = minutesAgo(createdMinutesAgo);
      const updatedAt = minutesAgo(Math.max(1, createdMinutesAgo - 30));
      const statusObj = statuses[listKey][status];
      const orderIndex = (listTaskCounts[listKey] || 0) + 1;
      listTaskCounts[listKey] = orderIndex;
      let completedAt = null;
      if (statusObj.type === 'done' || statusObj.type === 'closed') {
        const spreadDays = (orderIndex * 2 + Object.keys(listTaskCounts).length) % 7;
        const candidate = Date.now() - spreadDays * 24 * 60 * 60 * 1000 - 45 * 60 * 1000;
        const afterCreation = new Date(createdAt).getTime() + 60 * 60 * 1000;
        completedAt = new Date(Math.max(candidate, afterCreation)).toISOString();
      }
      insertTask.run(
        id,
        lists[listKey].id,
        parent,
        name,
        description,
        statusObj.id,
        priority,
        users[assignee],
        start,
        due,
        estimate,
        orderIndex,
        users.lin,
        createdAt,
        updatedAt,
        completedAt
      );
      for (const tagName of tags) {
        if (tagIds[tagName]) insertTaskTag.run(id, tagIds[tagName]);
      }
      for (const fieldName of Object.keys(fieldValues)) {
        const fieldId = fields[`${listKey}:${fieldName}`];
        if (fieldId) insertFieldValue.run(id, fieldId, String(fieldValues[fieldName]));
      }
      if (checklist) {
        const checklistId = randomId();
        insertChecklist.run(checklistId, id, checklist.name, 0);
        checklist.items.forEach((item, index) => {
          const itemName = typeof item === 'string' ? item : item.name;
          const done = typeof item === 'string' ? 0 : item.done ? 1 : 0;
          insertChecklistItem.run(randomId(), checklistId, itemName, done, index);
        });
      }
      for (const comment of comments) {
        insertComment.run(randomId(), id, users[comment.user], comment.body, minutesAgo(comment.ago));
        insertActivity.run(
          randomId(),
          workspaceId,
          id,
          users[comment.user],
          'comment',
          `在「${name}」中发表了评论`,
          minutesAgo(comment.ago)
        );
      }
      createdTasks.push({ id, listKey, name, createdMinutesAgo });
      insertActivity.run(
        randomId(),
        workspaceId,
        id,
        users.lin,
        'task_created',
        `创建了任务「${name}」`,
        createdAt
      );
      for (const sub of subtasks) {
        addTask(listKey, {
          ...sub,
          parent: id,
          assignee: sub.assignee || assignee,
          createdMinutesAgo: Math.max(1, createdMinutesAgo - 60),
        });
      }
      return id;
    }

    addTask('sprint', {
      name: '完成 v2.4 版本发布检查清单',
      status: 1,
      assignee: 'lin',
      priority: 2,
      start: day(-3),
      due: day(2),
      estimate: 480,
      tags: ['前端', '后端'],
      description:
        '目标：确保 v2.4 在周五前具备灰度发布条件。\n\n发布范围\n- 新的任务详情抽屉\n- 列表虚拟滚动（灰度 20%）\n- 修复 12 个遗留缺陷\n\n风险\n- 移动端离线缓存方案尚未评审完成，可能顺延至 v2.5。',
      checklist: {
        name: '发布检查',
        items: [
          { name: '回归测试通过', done: true },
          { name: '灰度环境部署', done: true },
          { name: '发布公告与更新日志', done: false },
          { name: '监控告警确认', done: false },
        ],
      },
      fields: { 故事点: 8, 迭代: 'S24' },
      subtasks: [
        { name: '验证灰度环境核心链路', status: 1, priority: 2, due: day(1), tags: ['后端'] },
        { name: '撰写 v2.4 发布公告', status: 0, priority: 3, due: day(2), tags: ['文档'] },
      ],
      comments: [
        { user: 'chen', body: '灰度环境已经部署完成，监控看板在这里：内部 Grafana / release-2.4。', ago: 200 },
        { user: 'lin', body: '收到，今天下班前我把更新日志补上。', ago: 120 },
      ],
      createdMinutesAgo: 60 * 24 * 12,
    });
    addTask('sprint', {
      name: '优化工作台首屏加载性能',
      status: 1,
      assignee: 'chen',
      priority: 2,
      start: day(-2),
      due: day(5),
      estimate: 360,
      tags: ['前端'],
      description: '首屏 LCP 目前 3.8s，目标降低到 1.8s 以内。\n\n- 拆分路由级 bundle\n- 任务列表改为虚拟滚动\n- 头像与图标改为懒加载',
      fields: { 故事点: 5, 迭代: 'S24' },
      createdMinutesAgo: 60 * 24 * 9,
    });
    addTask('sprint', {
      name: '移动端离线缓存方案评审',
      status: 2,
      assignee: 'su',
      priority: 3,
      due: day(1),
      tags: ['设计', '文档'],
      description: '评审本地优先的数据同步策略，重点关注冲突合并与存储上限。',
      fields: { 故事点: 3, 迭代: 'S24' },
      createdMinutesAgo: 60 * 24 * 8,
    });
    addTask('sprint', {
      name: '设计系统组件库升级',
      status: 0,
      assignee: 'zhou',
      priority: 3,
      due: day(9),
      tags: ['设计', '前端'],
      description: '统一 Button / Tag / Avatar 三个组件的圆角、阴影与状态色。',
      fields: { 故事点: 5, 迭代: 'S25' },
      createdMinutesAgo: 60 * 24 * 5,
    });
    addTask('sprint', {
      name: 'S23 迭代回顾会议纪要',
      status: 3,
      assignee: 'lin',
      priority: 4,
      due: day(-1),
      tags: ['文档'],
      description: '结论：需求评审提前到周一；灰度窗口固定为周三下午；缺陷修复 SLA 调整为 24 小时。',
      fields: { 故事点: 1, 迭代: 'S24' },
      createdMinutesAgo: 60 * 24 * 4,
    });
    addTask('sprint', {
      name: '用户反馈问题批量修复',
      status: 1,
      assignee: 'chen',
      priority: 1,
      due: day(0),
      tags: ['客户反馈', 'P0'],
      description: '汇总近两周 8 条高优客户反馈，逐条确认复现路径并修复。',
      fields: { 故事点: 3, 迭代: 'S24' },
      createdMinutesAgo: 60 * 24 * 2,
    });

    addTask('bugs', {
      name: '[P0] 看板拖拽后任务顺序丢失',
      status: 1,
      assignee: 'chen',
      priority: 1,
      due: day(0),
      start: day(-1),
      tags: ['前端', 'P0', '客户反馈'],
      description:
        '复现步骤\n1. 打开「迭代计划」看板视图\n2. 将任意任务在「进行中」列内调整顺序\n3. 刷新页面\n\n预期：顺序保持\n实际：恢复为旧顺序，偶尔会跳回第一列。\n\n初步定位为 status 更新与 order_index 写入存在竞态。',
      fields: { 严重程度: '严重', 影响版本: 'v2.4.0', 复现概率: '必现' },
      comments: [
        { user: 'su', body: '客户「云图设计」今天又反馈了一次，影响他们每周例会前的排期。', ago: 90 },
        { user: 'chen', body: '已定位，是拖拽结束后只发了 status 更新。今天会补上批量排序接口。', ago: 35 },
        { user: 'lin', body: '修复后麻烦同步一下客户成功同学。', ago: 20 },
      ],
      createdMinutesAgo: 60 * 24 * 3,
    });
    addTask('bugs', {
      name: '移动端附件预览偶发白屏',
      status: 2,
      assignee: 'su',
      priority: 2,
      due: day(3),
      tags: ['客户反馈'],
      fields: { 严重程度: '一般', 影响版本: 'v2.3.6', 复现概率: '偶现' },
      description: 'iOS Safari 下打开 PDF 附件约有 10% 概率白屏，退出重进可恢复。',
      createdMinutesAgo: 60 * 24 * 6,
    });
    addTask('bugs', {
      name: '登录态过期后跳转异常',
      status: 0,
      assignee: 'zhou',
      priority: 3,
      due: day(4),
      tags: ['前端'],
      fields: { 严重程度: '一般', 影响版本: 'v2.4.0', 复现概率: '高频' },
      description: 'token 过期后访问深链接，会先渲染空状态再跳登录页，出现闪烁。',
      createdMinutesAgo: 60 * 24 * 5,
    });
    addTask('bugs', {
      name: '搜索框输入中文候选词被截断',
      status: 3,
      assignee: 'chen',
      priority: 3,
      due: day(-2),
      tags: ['前端'],
      fields: { 严重程度: '轻微', 影响版本: 'v2.3.6', 复现概率: '必现' },
      description: '中文输入法组合输入期间触发搜索，导致候选词被截断。需要监听 composition 事件。',
      createdMinutesAgo: 60 * 24 * 8,
    });
    addTask('bugs', {
      name: '导出 CSV 时时间字段时区错误',
      status: 0,
      assignee: 'lin',
      priority: 2,
      due: day(6),
      tags: ['后端'],
      fields: { 严重程度: '一般', 影响版本: 'v2.4.0', 复现概率: '必现' },
      description: '导出文件中的截止时间比界面显示早 8 小时，需统一使用本地时区格式化。',
      createdMinutesAgo: 60 * 24 * 4,
    });
    addTask('bugs', {
      name: '通知中心未读数不刷新',
      status: 4,
      assignee: 'chen',
      priority: 4,
      due: day(-3),
      tags: ['前端'],
      fields: { 严重程度: '轻微', 影响版本: 'v2.3.5', 复现概率: '偶现' },
      description: '已确认与浏览器休眠恢复有关，暂不修复，等待通知模块整体重构。',
      createdMinutesAgo: 60 * 24 * 10,
    });

    addTask('prd', {
      name: '任务依赖关系 2.0 需求文档',
      status: 2,
      assignee: 'lin',
      priority: 2,
      due: day(4),
      tags: ['文档'],
      description:
        '背景\n当前的阻塞关系只支持单层级，跨列表依赖无法表达。\n\n核心场景\n- 任务 A 完成后自动将任务 B 移入进行中\n- 甘特图上展示跨项目依赖线\n- 冲突检测：循环依赖提示\n\n本期不做\n- 自动排期算法\n- 外部系统依赖',
      checklist: {
        name: '评审准备',
        items: [
          { name: '竞品交互截图', done: true },
          { name: '研发可行性确认', done: true },
          { name: '客户访谈补充', done: false },
        ],
      },
      fields: { 需求类型: '新功能', 目标版本: 'v2.5' },
      comments: [
        { user: 'chen', body: '后端需要新增 dependencies 表和拓扑排序校验，工作量大概 3 人日。', ago: 300 },
      ],
      createdMinutesAgo: 60 * 24 * 11,
    });
    addTask('prd', {
      name: '团队视图自定义字段调研',
      status: 1,
      assignee: 'su',
      priority: 3,
      due: day(7),
      tags: ['文档', '客户反馈'],
      description: '收集 10 家团队的字段使用习惯，输出字段类型优先级。',
      fields: { 需求类型: '体验优化', 目标版本: 'v2.5' },
      createdMinutesAgo: 60 * 24 * 7,
    });
    addTask('prd', {
      name: '移动端快捷创建交互稿',
      status: 3,
      assignee: 'zhou',
      priority: 3,
      due: day(-2),
      tags: ['设计'],
      description: '长按底部按钮快速创建任务，支持语音转文字（后续版本）。',
      fields: { 需求类型: '新功能', 目标版本: 'v2.4' },
      createdMinutesAgo: 60 * 24 * 13,
    });
    addTask('prd', {
      name: '数据导出中心 PRD',
      status: 0,
      assignee: 'lin',
      priority: 3,
      due: day(14),
      tags: ['文档'],
      description: '统一任务、时间记录与评论的导出入口，支持 CSV / JSON。',
      fields: { 需求类型: '新功能', 目标版本: 'v3.0' },
      createdMinutesAgo: 60 * 24 * 6,
    });
    addTask('prd', {
      name: '个人主页改版需求',
      status: 0,
      assignee: 'su',
      priority: 4,
      due: day(18),
      tags: ['设计'],
      description: '展示个人负责的任务、最近动态与工作负载。',
      fields: { 需求类型: '体验优化', 目标版本: 'v3.0' },
      createdMinutesAgo: 60 * 24 * 4,
    });

    addTask('frontend', {
      name: '重构任务详情抽屉组件',
      status: 1,
      assignee: 'chen',
      priority: 3,
      due: day(6),
      tags: ['前端'],
      description: '将 1200 行的 TaskDrawer 拆分为详情、子任务、活动三个子模块。',
      createdMinutesAgo: 60 * 24 * 6,
    });
    addTask('frontend', {
      name: '列表虚拟滚动',
      status: 0,
      assignee: 'chen',
      priority: 3,
      due: day(10),
      tags: ['前端'],
      description: '支撑单列表 5000 条任务不卡顿，首屏渲染控制在 100ms 内。',
      createdMinutesAgo: 60 * 24 * 8,
    });
    addTask('frontend', {
      name: '暗色模式样式适配',
      status: 2,
      assignee: 'zhou',
      priority: 3,
      due: day(2),
      tags: ['设计', '前端'],
      description: '覆盖看板、日历、任务详情三个核心页面。',
      createdMinutesAgo: 60 * 24 * 5,
    });
    addTask('frontend', {
      name: '替换旧版图标库',
      status: 3,
      assignee: 'chen',
      priority: 4,
      due: day(-5),
      tags: ['前端'],
      description: '统一使用 lucide 图标，移除 60KB 的旧图标字体。',
      createdMinutesAgo: 60 * 24 * 14,
    });
    addTask('frontend', {
      name: '日历视图周切换动画',
      status: 0,
      assignee: 'zhou',
      priority: 4,
      due: day(11),
      tags: ['前端'],
      description: '左右滑动切换周视图时加入过渡动画，保持滚动位置。',
      createdMinutesAgo: 60 * 24 * 3,
    });

    addTask('design', {
      name: '新版导航栏视觉走查',
      status: 1,
      assignee: 'zhou',
      priority: 2,
      due: day(1),
      tags: ['设计'],
      description: '对比设计稿逐项检查间距、字号、图标与交互状态。',
      createdMinutesAgo: 60 * 24 * 1,
    });
    addTask('design', {
      name: '空状态插画设计',
      status: 3,
      assignee: 'zhou',
      priority: 3,
      due: day(-4),
      tags: ['设计'],
      description: '覆盖空列表、空搜索、无权限三个场景。',
      createdMinutesAgo: 60 * 24 * 12,
    });
    addTask('design', {
      name: '状态标签颜色规范',
      status: 2,
      assignee: 'zhou',
      priority: 3,
      due: day(2),
      tags: ['设计'],
      description: '补齐成功、警告、危险、信息四组语义色的深浅梯度。',
      createdMinutesAgo: 60 * 24 * 4,
    });
    addTask('design', {
      name: '移动端手势交互规范',
      status: 0,
      assignee: 'zhou',
      priority: 4,
      due: day(8),
      tags: ['设计', '文档'],
      description: '定义滑动、长按、下拉刷新在任务列表中的行为边界。',
      createdMinutesAgo: 60 * 24 * 2,
    });

    addTask('research', {
      name: 'SQLite 本地优先同步方案调研',
      status: 1,
      assignee: 'chen',
      priority: 3,
      due: day(5),
      tags: ['后端'],
      description: '评估 CRDT 与 last-write-wins 在离线编辑场景下的取舍，输出 PoC。',
      createdMinutesAgo: 60 * 24 * 9,
    });
    addTask('research', {
      name: '富文本编辑器选型对比',
      status: 3,
      assignee: 'lin',
      priority: 4,
      due: day(-6),
      tags: ['文档'],
      description: '结论：短期使用 Markdown + 预览，长期再评估协同编辑方案。',
      createdMinutesAgo: 60 * 24 * 16,
    });
    addTask('research', {
      name: '大文件分片上传技术验证',
      status: 0,
      assignee: 'chen',
      priority: 3,
      due: day(15),
      tags: ['后端'],
      description: '验证断点续传与秒传能力，目标支持 2GB 附件。',
      createdMinutesAgo: 60 * 24 * 3,
    });

    addTask('content', {
      name: '11 月产品更新博客',
      status: 1,
      assignee: 'su',
      priority: 2,
      due: day(3),
      tags: ['文档', '增长'],
      description: '围绕 v2.4 的看板体验与性能优化，写一篇 1500 字左右的更新说明。',
      fields: { 发布渠道: '官网博客' },
      createdMinutesAgo: 60 * 24 * 5,
    });
    addTask('content', {
      name: '客户案例：星野设计团队',
      status: 2,
      assignee: 'lin',
      priority: 3,
      due: day(5),
      tags: ['文档', '客户反馈'],
      description: '访谈提纲已完成，等待客户确认对外发布授权。',
      fields: { 发布渠道: '公众号' },
      comments: [
        { user: 'su', body: '初稿已发到群里，重点突出了他们 30 人团队的周会流程。', ago: 180 },
      ],
      createdMinutesAgo: 60 * 24 * 8,
    });
    addTask('content', {
      name: '年度效率报告选题',
      status: 0,
      assignee: 'su',
      priority: 4,
      due: day(9),
      tags: ['增长'],
      description: '结合平台匿名数据，策划一份「2026 团队效率趋势」报告。',
      fields: { 发布渠道: '公众号' },
      createdMinutesAgo: 60 * 24 * 2,
    });
    addTask('content', {
      name: '短视频脚本：3 个任务管理技巧',
      status: 3,
      assignee: 'su',
      priority: 4,
      due: day(-4),
      tags: ['增长'],
      description: '已发布到视频号，播放 2.3w，完播率 38%。',
      fields: { 发布渠道: '视频号' },
      createdMinutesAgo: 60 * 24 * 10,
    });

    addTask('events', {
      name: '12 月线上发布会筹备',
      status: 1,
      assignee: 'lin',
      priority: 2,
      start: day(-1),
      due: day(12),
      tags: ['增长'],
      description: '发布会主题：把复杂工作变简单。\n\n需要协调：产品演示、客户证言视频、直播平台与物料。',
      checklist: {
        name: '筹备事项',
        items: [
          { name: '确定发布会主题与议程', done: true },
          { name: '客户证言视频拍摄', done: false },
          { name: '直播平台压测', done: false },
          { name: '邀请函与推广物料', done: false },
        ],
      },
      createdMinutesAgo: 60 * 24 * 7,
    });
    addTask('events', {
      name: '用户沙龙（上海站）物料清单',
      status: 0,
      assignee: 'su',
      priority: 3,
      due: day(8),
      tags: ['增长'],
      description: '场地已确认，需准备签到台、易拉宝、伴手礼与问卷二维码。',
      createdMinutesAgo: 60 * 24 * 4,
    });
    addTask('events', {
      name: '双十一限时优惠复盘',
      status: 3,
      assignee: 'su',
      priority: 3,
      due: day(-7),
      tags: ['增长'],
      description: '新增注册 1,284，转化率 6.8%，高于预期 2.1 个百分点。',
      createdMinutesAgo: 60 * 24 * 15,
    });

    addTask('growth', {
      name: '新用户 7 日留存实验',
      status: 1,
      assignee: 'lin',
      priority: 2,
      start: day(-4),
      due: day(7),
      tags: ['增长'],
      description: '实验组在注册后第 2 天推送「创建第一个任务」引导，观察 7 日留存。',
      createdMinutesAgo: 60 * 24 * 6,
    });
    addTask('growth', {
      name: '邀请奖励流程 A/B 测试',
      status: 2,
      assignee: 'su',
      priority: 3,
      due: day(3),
      tags: ['增长'],
      description: 'A 组：双方各得 1 个月 Pro；B 组：邀请人获得积分。',
      createdMinutesAgo: 60 * 24 * 8,
    });
    addTask('growth', {
      name: '官网着陆页转化率优化',
      status: 0,
      assignee: 'zhou',
      priority: 3,
      due: day(10),
      tags: ['增长', '设计'],
      description: '重做首屏价值主张与产品截图，目标注册转化率提升 15%。',
      createdMinutesAgo: 60 * 24 * 3,
    });

    addTask('hiring', {
      name: '高级前端工程师（急招）',
      status: 2,
      assignee: 'lin',
      priority: 2,
      due: day(2),
      tags: [],
      description: '负责性能优化与组件库建设，要求 5 年以上经验，熟悉 React 与工程化。',
      checklist: {
        name: '面试流程',
        items: [
          { name: '简历初筛', done: true },
          { name: '技术一面', done: true },
          { name: '技术二面', done: false },
          { name: 'HR 面与 offer 沟通', done: false },
        ],
      },
      createdMinutesAgo: 60 * 24 * 11,
    });
    addTask('hiring', {
      name: '产品设计师招聘',
      status: 1,
      assignee: 'su',
      priority: 3,
      due: day(6),
      tags: ['设计'],
      description: '需要具备 B 端 SaaS 设计经验，作品集需包含完整项目流程。',
      createdMinutesAgo: 60 * 24 * 7,
    });
    addTask('hiring', {
      name: '内容运营实习生',
      status: 0,
      assignee: 'su',
      priority: 4,
      due: day(9),
      tags: [],
      description: '负责公众号排版与社群内容整理，每周到岗 3 天。',
      createdMinutesAgo: 60 * 24 * 3,
    });
    addTask('hiring', {
      name: '后端工程师 Offer 审批',
      status: 3,
      assignee: 'lin',
      priority: 3,
      due: day(-1),
      tags: [],
      description: '候选人已接受口头 offer，等待正式审批邮件。',
      createdMinutesAgo: 60 * 24 * 5,
    });

    addTask('onboarding', {
      name: '新同事入职设备与账号准备',
      status: 0,
      assignee: 'su',
      priority: 3,
      due: day(1),
      tags: ['文档'],
      description: '笔记本、显示器、邮箱、GitLab 与内部系统权限。',
      checklist: {
        name: '准备清单',
        items: [
          { name: '设备采购与验收', done: true },
          { name: '创建公司邮箱', done: false },
          { name: '开通代码仓库权限', done: false },
        ],
      },
      createdMinutesAgo: 60 * 24 * 2,
    });
    addTask('onboarding', {
      name: '团队协作规范文档',
      status: 3,
      assignee: 'lin',
      priority: 3,
      due: day(-3),
      tags: ['文档'],
      description: '明确需求流转、状态定义、评论礼仪与响应时效。',
      createdMinutesAgo: 60 * 24 * 9,
    });
    addTask('onboarding', {
      name: '第一周 onboarding 计划',
      status: 1,
      assignee: 'su',
      priority: 4,
      due: day(4),
      tags: ['文档'],
      description: '安排产品介绍、代码走读、客户访谈旁听与第一个小任务。',
      createdMinutesAgo: 60 * 24 * 4,
    });

    // A little extra recent activity so the inbox and home feed feel alive.
    const recent = createdTasks.slice(-8);
    for (const task of recent) {
      insertActivity.run(
        randomId(),
        workspaceId,
        task.id,
        users.zhou,
        'task_updated',
        `更新了任务「${task.name}」`,
        minutesAgo(18)
      );
    }
    insertActivity.run(
      randomId(),
      workspaceId,
      null,
      users.su,
      'workspace_joined',
      '加入了「星野科技」工作空间',
      minutesAgo(60 * 24 * 20)
    );
    insertActivity.run(
      randomId(),
      workspaceId,
      null,
      users.lin,
      'workspace_created',
      '创建了工作空间「星野科技」',
      minutesAgo(60 * 24 * 30)
    );

    const docs = [
      {
        title: '星野产品路线图 · 2026 Q4',
        content: `# 星野产品路线图 · 2026 Q4

> 目标：把复杂工作变简单。让每个 30 人以下的团队，都能用一套工具完成规划、执行与复盘。

## 本季度三大主题

### 1. 更快的任务体验
- 首屏 LCP 从 3.8s 降到 1.8s
- 列表支持 5000 条任务虚拟滚动
- 全新的任务详情抽屉

### 2. 更清晰的协作
- 任务依赖关系 2.0
- 自定义字段团队视图
- 评论与通知整合

### 3. 更稳的移动端
- 离线缓存与本地优先同步
- 附件预览稳定性
- 手势交互规范

## 关键里程碑

| 时间 | 事项 | 负责人 |
| --- | --- | --- |
| 11 月第 2 周 | v2.4 灰度发布 | 陈墨 |
| 11 月第 4 周 | 依赖关系 2.0 评审 | 林晓 |
| 12 月第 1 周 | 线上发布会 | 苏晴 |

## 需要决策

- [x] 是否将富文本编辑器延后到 v3.0
- [ ] 移动端是否接入本地数据库
- [ ] 发布会是否开放第三方直播

---

*最后更新：产品团队*`,
      },
      {
        title: '团队协作指南',
        content: `# 团队协作指南

这份指南帮助我们保持一致的协作节奏。它不追求完美，但需要每个人共同维护。

## 任务状态

| 状态 | 含义 | 进入条件 |
| --- | --- | --- |
| 待处理 | 已确认但尚未开始 | 有明确负责人和截止时间 |
| 进行中 | 正在推进 | 已创建分支 / 已开始设计 |
| 审核中 | 等待他人反馈 | 附上评审链接与验收标准 |
| 已完成 | 已达到验收标准 | 验收人确认 |
| 已关闭 | 取消或不再处理 | 写明原因 |

## 每周节奏

- **周一 10:00** 需求评审，控制在 45 分钟
- **周三 14:00** 灰度发布窗口
- **周五 16:00** 迭代回顾与下周排期

## 评论礼仪

1. 先说结论，再补充背景
2. 尽量 @ 到具体负责人
3. 需要决策的事项，用「待办」明确下一步

## 响应时效

- P0：30 分钟内响应
- P1：4 小时内响应
- 其他：一个工作日内响应

> 如果你不确定该找谁，先在团队频道里问一句，而不是私聊等待。`,
      },
      {
        title: 'v2.4 发布流程 SOP',
        content: `# v2.4 发布流程 SOP

## 发布前 3 天

- [ ] 完成回归测试，输出测试报告
- [ ] 确认灰度名单与回滚方案
- [ ] 更新发布公告与更新日志

## 发布当天

1. 10:00 冻结主干，创建 release/2.4 分支
2. 14:00 部署灰度环境，观察核心指标 2 小时
3. 16:30 全量发布，监控错误率与 P95 延迟
4. 18:00 发送发布完成通知

## 回滚条件

- 5xx 错误率超过 1%
- 核心接口 P95 延迟超过 800ms
- 出现数据不一致问题

## 发布后

- 24 小时内收集客服与客户成功反馈
- 48 小时内完成发布复盘
- 将遗留问题转入缺陷跟踪列表`,
      },
    ];
    for (const doc of docs) {
      const content = doc.content.replace(/^#\s+.+\n+/, '');
      insertDoc.run(randomId(), workspaceId, doc.title, content, users.lin, minutesAgo(60 * 24 * 3), minutesAgo(60 * 24 * 3));
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
