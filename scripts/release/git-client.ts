import { gitP, SimpleGit } from 'simple-git';

export type Change = {
  hash: string;
  message: string;
};

export class GitClient {
  simpleGit: SimpleGit;
  constructor(path: string) {
    this.simpleGit = gitP(path);
  }

  /**
   * Returns a list of commits in the given commit range, inclusive,
   * in order of ascending commit time.
   */
  async listCommits({from, to}: {
    from: string;
    to: string;
  }): Promise<Change[]> {
    return [...(await this.simpleGit.log({
      from,
      to
    })).all].reverse();
  }

  async getFile({commitish, file}: {
    commitish: string;
    file: string;
  }) {
    return await this.simpleGit.show([`${commitish}:${file}`]);
  }
}
