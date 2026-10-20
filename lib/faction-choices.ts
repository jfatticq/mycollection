type FactionTerm = { id?: string; kind?: string; name: string; parent_id?: string | null };
const suggestedFactions = ['G.I. Joe', 'Cobra', 'Dreadnoks', 'Iron Grenadiers', 'Oktober Guard'];
export function factionChoices(terms: FactionTerm[]) {
  const choices = new Map<string, FactionTerm>();
  for (const term of [...suggestedFactions.map(name => ({ name })), ...terms.filter(term => term.kind === 'faction')]) {
    const name = term.name.trim().normalize('NFC');
    if (name) choices.set(name.toLowerCase(), { ...term, name });
  }
  return [...choices.values()].sort((a, b) => a.name.localeCompare(b.name)).map(term => {
    const parent = terms.find(parent => parent.id && parent.id === term.parent_id)?.name.trim();
    return { ...term, label: parent && !term.name.endsWith(`(${parent})`) ? `${term.name} — ${parent}` : term.name };
  });
}
