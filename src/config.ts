import Conf from 'conf';
import type { Config } from './types.js';

export const config = new Conf<Config>({
  projectName: 'linear-pr',
  defaults: {
    defaultBranch: 'development',
  }
});