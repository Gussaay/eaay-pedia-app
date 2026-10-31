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

// Banks can share a main group on the MCQs page in the same way (e.g. PREP and
// Nelson → "General MCQs Books"). A bank joins one through the `group` field
// on its main_category record, holding the group's title. The group card takes
// the place of its first bank; each bank inside still opens as before.

/**
 * The MCQs page list: banks and bank groups in their original order, each
 * group shown once where its first bank was. Items are { bank } or
 * { group: { key, title, banks } }.
 */
export function groupBanks(banks) {
  const out = [];
  const seen = new Map();
  for (const bank of banks) {
    const key = String(bank.group || '').trim();
    if (!key) {
      out.push({ bank });
      continue;
    }
    if (!seen.has(key)) {
      const group = { key, title: key, banks: [] };
      seen.set(key, group);
      out.push({ group });
    }
    seen.get(key).banks.push(bank);
  }
  return out;
}
