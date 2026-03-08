import EventEmitter from 'events';
import {db} from './firebase';
import {makeGrid} from '../lib/gameUtils';

// a wrapper class that models Puzzle

export default class Puzzle extends EventEmitter {
  constructor(path, pid) {
    super();
    this.ref = db.ref(path);
    this.pid = pid;
  }

  attach() {
    this.ref.on('value', (snapshot) => {
      this.data = snapshot.val();
      this.emit('ready');
    });
  }

  detach() {
    this.ref.off('value');
  }

  toGame() {
    const {info, circles = [], shades = [], images = {}, grid: solution, pid} = this.data;
    const gridObject = makeGrid(solution, false, images);
    const clues = gridObject.alignClues(this.data.clues);
    const grid = gridObject.toArray();

    const game = {
      info,
      circles,
      shades,
      ...(Object.keys(images).length > 0 ? {images} : {}),
      clues,
      solution,
      pid,
      grid,
      createTime: Date.now(),
      startTime: null,
      chat: {
        users: [],
        messages: [],
      },
    };
    return game;
  }

  get info() {
    if (!this.data) return undefined;
    return this.data.info;
  }
}
