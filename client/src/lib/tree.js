export function flattenLists(spaces = []) {
  const result = [];
  for (const space of spaces) {
    for (const folder of space.folders || []) {
      for (const list of folder.lists || []) {
        result.push({ list, space, folder });
      }
    }
    for (const list of space.lists || []) {
      result.push({ list, space, folder: null });
    }
  }
  return result;
}

export function findList(spaces = [], listId) {
  return flattenLists(spaces).find((entry) => entry.list.id === listId) || null;
}

export function firstList(spaces = []) {
  return flattenLists(spaces)[0] || null;
}

export function findDoc(docs = [], docId) {
  return docs.find((doc) => doc.id === docId) || null;
}

export function workspaceTaskTotal(spaces = []) {
  return spaces.reduce(
    (total, space) =>
      total +
      (space.lists || []).reduce((sum, list) => sum + (list.task_count || 0), 0) +
      (space.folders || []).reduce(
        (sum, folder) => sum + (folder.lists || []).reduce((inner, list) => inner + (list.task_count || 0), 0),
        0
      ),
    0
  );
}
