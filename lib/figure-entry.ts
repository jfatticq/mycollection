type Character = {name: string; partId: string | null};
type Figure = {id: string; name: string};

export function editFigureCharacter(figure: Figure, characters: Character[], name: string) {
  const previous = characters.find(character => character.partId === figure.id);
  const next = name.trim() ? {name, partId: figure.id} : null;
  const updated = previous
    ? characters.flatMap(character => character === previous ? next ? [next] : [] : [character])
    : next ? [...characters, next] : characters;
  return {
    // Once the part has a descriptive name, character edits must not overwrite it.
    partName: next && (!figure.name.trim() || figure.name === previous?.name) ? name : figure.name,
    characters: updated.filter((character, index, all) => all.findIndex(other =>
      other.partId === character.partId && other.name.trim().toLowerCase() === character.name.trim().toLowerCase()) === index),
  };
}
