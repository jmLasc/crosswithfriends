import {gameWords} from './lib/names';

import {incrementGid, incrementPid} from './api/counters';

const actions = {
  // puzzle: { title, type, grid, clues }
  createPuzzle: async (puzzle, cbk) => {
    const {pid} = await incrementPid();
    cbk && cbk(pid);
  },

  getNextGid: async (cbk) => {
    const {gid} = await incrementGid();
    const word = gameWords[Math.floor(Math.random() * gameWords.length)];
    cbk(`${gid}-${word}`);
  },
};

export default actions;
