export const PROJECT_COLORS = [
  { value: '#7B68EE', name: '紫罗兰', meaning: '产品与项目' },
  { value: '#4A9EFF', name: '海蓝', meaning: '客户与市场' },
  { value: '#26C6DA', name: '青碧', meaning: '探索与实验' },
  { value: '#2EA44F', name: '翠绿', meaning: '运营与交付' },
  { value: '#F59E0B', name: '琥珀', meaning: '增长与营销' },
  { value: '#FF8A65', name: '珊瑚', meaning: '设计与创意' },
  { value: '#E5484D', name: '朱红', meaning: '风险与紧急' },
  { value: '#A25DDC', name: '紫藤', meaning: '团队与支持' },
];

export function colorInfo(value) {
  return PROJECT_COLORS.find((color) => color.value.toLowerCase() === String(value || '').toLowerCase()) || {
    value: value || '#7B68EE',
    name: '自定义',
    meaning: '自定义识别色',
  };
}
