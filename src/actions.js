import {gameWords} from './lib/names';
import firebase from './store/firebase';

import {incrementGid, incrementPid} from './api/counters';

// Used by backfill scripts (backfills/progress.js, deleteGames.js, v2pid.js)
const db = firebase.database();
function disconnect() {
  // no-op for now
}

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

export {db, disconnect};
export default actions;
