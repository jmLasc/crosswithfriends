function convertCluesArray(initialCluesArray) {
  const finalCluesArray = [];

  for (let i = 0; i < initialCluesArray.length; i++) {
    const item = initialCluesArray[i];
    let number;
    let stringClue;
    if (Array.isArray(item)) {
      number = parseInt(item[0], 10);
      stringClue = item[1];
    } else {
      number = parseInt(item.number, 10);
      stringClue = item.clue;
    }
    finalCluesArray[parseInt(number, 10)] = stringClue;
  }

  return finalCluesArray;
}

export default function iPUZtoJSON(readerResult) {
  const jsonFromReader = JSON.parse(new TextDecoder().decode(readerResult));
  const hasSolution = !!jsonFromReader.solution;
  const contest = !hasSolution;
  const gridSource = jsonFromReader.solution || jsonFromReader.puzzle;
  const grid = gridSource.map((row) =>
    row.map((rawCell) => {
      // Unwrap object-wrapped cells (e.g. {cell: '#'}, {cell: 1, style: ...})
      const cell = typeof rawCell === 'object' && rawCell !== null ? rawCell.cell : rawCell;
      if (cell === null || cell === '#') return '.';
      if (cell === ' ') return ''; // image/decorative cells — white but non-typeable
      if (!hasSolution) return ''; // no solution — white cells are empty
      return cell;
    })
  );
  const info = {
    type: grid.length > 10 ? 'Daily Puzzle' : 'Mini Puzzle',
    title: jsonFromReader.title || '',
    author: jsonFromReader.author || '',
    description: jsonFromReader.notes || '',
  };
  const circles = [];
  const shades = [];
  const images = {};

  jsonFromReader.puzzle.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      if (typeof cell === 'object' && cell?.style) {
        const flatIdx = rowIndex * row.length + cellIndex;
        if (cell.style.shapebg === 'circle') {
          circles.push(flatIdx);
        }
        if (cell.style.color || cell.style.highlight) {
          shades.push(flatIdx);
        }
        if (cell.style.imagebg) {
          images[flatIdx] = cell.style.imagebg;
        }
      }
    });
  });

  let across = [];
  let down = [];

  Object.entries(jsonFromReader.clues).forEach(([direction, clues]) => {
    if (direction === 'Across') {
      across = convertCluesArray(clues);
    } else if (direction === 'Down') {
      down = convertCluesArray(clues);
    }
  });

  return {
    grid,
    info,
    circles,
    shades,
    ...(Object.keys(images).length > 0 ? {images} : {}),
    across,
    down,
    contest,
  };
}
