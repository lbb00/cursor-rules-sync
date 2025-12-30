import fs from 'fs-extra'

export interface FS {
  pathExists(p: string): Promise<boolean>
  lstat(p: string): Promise<fs.Stats>
  readlink(p: string): Promise<string>
}

export const nodeFS: FS = {
  pathExists: fs.pathExists,
  lstat: fs.lstat,
  readlink: fs.readlink,
}


