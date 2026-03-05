import {offline} from './firebase';

import demoGame from './demoGame';
import demoUser, {getUser as _demoGetUser} from './demoUser';
import game from './game';
import user, {getUser as _getUser} from './user';
import puzzle from './puzzle';

export const GameModel = offline ? demoGame : game;
export const UserModel = offline ? demoUser : user;
export const PuzzleModel = puzzle;

export const getUser = offline ? _demoGetUser : _getUser;
