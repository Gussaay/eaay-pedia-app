// Groups inside a question bank (e.g. MRCPCH → TAS and FOP). A book joins a
// group through its `group` field; the bank record names the groups and their
// order under `groups`: { TAS: { title, subtitle, order } }. A bank whose books
// have no group shows its books as before.

/**
 * What the Sources tab lists for a bank: the groups (each with its books) and
 * the books that belong to no group, in that order.
 */
export function groupBooks(books, bankRecord) {
  const defs = bankRecord?.groups || {};
  const byGroup = new Map();
  const loose = [];
  for (const b of books) {
    const g = String(b.group || '').trim();
    if (!g) loose.push(b);
    else {
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(b);
    }
  }
  const groups = [...byGroup.entries()]
    .map(([key, list]) => ({
      key,
      title: defs[key]?.title || key,
      subtitle: defs[key]?.subtitle || '',
      img: defs[key]?.img || '',
      order: Number(defs[key]?.order ?? Infinity),
      books: list,
    }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { groups, loose };
}
