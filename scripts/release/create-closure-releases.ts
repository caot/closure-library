import { Change, GitClient } from './git-client';
import { GitHubClient } from './github-client';

const MATCH_PJSON_MAJOR_VERSION = /^v?(\d+)\.\d+\.\d+$/;

const MATCH_RELNOTES = /RELNOTES(?:\[(INC|NEW)\])?:(.*)/;
const MATCH_ROLLBACK = /roll(?:s\s+)?back|revert.*\s([A-Fa-f0-9]{7,}).?$/i;
const MATCH_INVALID_NOTE = /(none|n\/?a)\.?$/i;

const RELEASE_HEADINGS = [
  {
    changeType: 'NEW',
    heading: '**New Additions**',
  },
  {
    changeType: 'INC',
    heading: '**Backwards Incompatible Changes**',
  },
  {
    changeType: 'NONE',
    heading: '**Other Changes**',
  }
];

function commitHashesEqual(a: string, b: string) {
  return a.startsWith(b) || b.startsWith(a);
}

function escapeGitHubMarkdown(note: string) {
  // "Escape" GitHub mentions (i.e., "@user") by surrounding in backticks.
  note = note.replace(/(@\w+)/g, '`$1`');
  // Escape known markdown characters with a leading backslash.
  note = note.replace(/([*_(){}#!.<>\[\]])/g, '\\$1');
  return note;
}

function createReleaseNotes(changes: Change[]) {
  const changeNotes: Array<{ changeType: string, noteText: string, hash: string; rolledback: boolean }> = [];
  for (const {hash, message} of changes) {
    // Don't include a message like "RELNOTES: n/a".
    if (MATCH_INVALID_NOTE.test(message)) {
      continue;
    }
    const rollback = MATCH_ROLLBACK.exec(message);
    if (rollback) {
      // If we find a rollback commit, try to find the original change that got
      // rolled back by this one via commit hash.
      const rolledbackCommit = message[1];
      const matchingChange = changeNotes.find(change =>
        commitHashesEqual(change.hash, rolledbackCommit));
      if (matchingChange) {
        matchingChange.rolledback = true;
      }
    } else {
      const matchedRelnotes = MATCH_RELNOTES.exec(message);
      if (matchedRelnotes) {
        const changeType = matchedRelnotes[1] || 'NONE';
        const noteText = matchedRelnotes[2].trim();
        changeNotes.push({
          changeType,
          noteText: escapeGitHubMarkdown(noteText),
          hash,
          rolledback: false
        });
      }
    }
  }
  let body = '';
  for (const {changeType, heading} of RELEASE_HEADINGS) {
    const formattedChangesForHeading = changeNotes
      .filter(changeNote => changeNote.changeType === changeType)
      .filter(({rolledback}) => !rolledback)
      .map(({noteText, hash}) => `* ${noteText} (${hash})`).join('\n');
    body += `${heading}\n${formattedChangesForHeading}\n\n`;
  }
  if (!body) {
    body = 'No release notes.';
  }
  return body;
}

async function createClosureReleases(gitHubApiToken) {
  // Initialize clients.
  const github = new GitHubClient({
    owner: 'google',
    repo: 'closure-library',
    userAgent: 'Google-Closure-Library',
    token: gitHubApiToken
  });
  const git = new GitClient(process.cwd());

  // Get the commit SHA of the latest GitHub release.
  const from = await github.getLatestRelease();
  // Get the list of commits since `from`.
  const commits = await git.listCommits({from, to: 'HEAD'});
  // Identify the commits in which the package.json value changed, omitting
  // the first commit (which corresponds to `from`).
  const pJsonVersions: Array<{version: string, changes: Change[]}> = [];
  let seenCommits: Change[] = [];
  for (const commit of commits) {
    const pJsonRaw = await git.getFile({
      commitish: commit.hash,
      file: 'package.json'
    });
    const pJson = JSON.parse(pJsonRaw);
    const matchedPJsonVersion = MATCH_PJSON_MAJOR_VERSION.exec(pJson.version);
    if (!matchedPJsonVersion) {
      throw new Error(`Bad package.json version string '${pJson.version}' @ ${commit.hash}`);
    }
    const pJsonVersion = `v${matchedPJsonVersion[1]}`;
    seenCommits.push(commit);
    if (!pJsonVersions.some(entry => entry.version === pJsonVersion)) {
      pJsonVersions.push({
        version: pJsonVersion,
        changes: seenCommits
      });
      seenCommits = [];
    }
  }
  // Draft a new GitHub release for each package.json version change seen.
  for (const { version, changes } of pJsonVersions.slice(1)) {
    const name = `Closure Library ${version}`;
    const tagName = version;
    const commit = changes[changes.length - 1].hash;
    const body = createReleaseNotes(changes);
    // Create the release
    const url = await github.draftRelease({tagName, commit, name, body});
    console.log(`Drafted release for ${version} at ${url}`);
  }
}

module.exports = createClosureReleases;

if (require.main === module) {
  if (!process.env.GITHUB_TOKEN) {
    console.error(`Need GITHUB_TOKEN env var to create releases.`);
    process.exit(1);
  }
  createClosureReleases(process.env.GITHUB_TOKEN).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
