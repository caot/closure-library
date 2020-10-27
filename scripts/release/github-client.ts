import { Octokit } from '@octokit/rest';

export class GitHubClient {
  private readonly owner: string;
  private readonly repo: string;
  private readonly octokit: Octokit;
  constructor({owner, repo, userAgent, token}: {
    owner: string;
    repo: string;
    userAgent: string;
    token: string;
  }) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({
      auth: token,
      userAgent
    });
  }

  async getLatestRelease() {
    const {data} = await this.octokit.repos.getLatestRelease({
      owner: this.owner,
      repo: this.repo
    });
    return data.target_commitish;
  }

  async draftRelease({tagName, commit, name, body}: {
    tagName: string;
    commit: string;
    name: string;
    body: string;
  }) {
    const {data} = await this.octokit.repos.createRelease({
      owner: this.owner,
      repo: this.repo,
      tag_name: tagName,
      target_commitish: commit,
      name,
      body,
      draft: true
    });
    return data.html_url;
  }
}
