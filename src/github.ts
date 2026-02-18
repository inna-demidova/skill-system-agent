const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "inna-demidova/skill-system-agent";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

export const githubEnabled = !!GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.warn("[github] GITHUB_TOKEN not set — GitHub sync disabled");
}

async function githubFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });
}

interface GitHubFileInfo {
  sha: string;
  content: string;
}

/** Get file SHA (needed for update/delete). Returns null if file doesn't exist. */
async function getFileSha(filePath: string): Promise<string | null> {
  const res = await githubFetch(`${filePath}?ref=${GITHUB_BRANCH}`);
  if (!res.ok) return null;
  const data = (await res.json()) as GitHubFileInfo;
  return data.sha;
}

/** Create or update a file in the repo. */
export async function createOrUpdateFile(filePath: string, content: string, message: string): Promise<void> {
  if (!githubEnabled) return;

  const sha = await getFileSha(filePath);
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await githubFetch(filePath, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${err}`);
  }
}

/** Delete a single file from the repo. */
export async function deleteFile(filePath: string, message: string): Promise<void> {
  if (!githubEnabled) return;

  const sha = await getFileSha(filePath);
  if (!sha) return; // file doesn't exist in repo

  const res = await githubFetch(filePath, {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${err}`);
  }
}

interface GitHubDirEntry {
  path: string;
  type: string;
  sha: string;
}

/** Delete all files in a directory (GitHub has no directory delete). */
export async function deleteDirectory(dirPath: string, message: string): Promise<void> {
  if (!githubEnabled) return;

  // List directory contents
  const res = await githubFetch(`${dirPath}?ref=${GITHUB_BRANCH}`);
  if (!res.ok) return; // directory doesn't exist in repo

  const entries = (await res.json()) as GitHubDirEntry[];
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    if (entry.type === "dir") {
      await deleteDirectory(entry.path, message);
    } else {
      await deleteFile(entry.path, message);
    }
  }
}
