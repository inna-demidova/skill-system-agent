import { Router } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import { createOrUpdateFile, deleteFile, deleteDirectory } from "./github";

const router = Router();
const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

// --- Helpers ---

function isValidName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

function safePath(skillName: string, filePath?: string): string | null {
  const base = path.join(SKILLS_DIR, skillName);
  if (!filePath) return base;

  // Block path traversal
  if (filePath.includes("..") || path.isAbsolute(filePath)) return null;

  const resolved = path.join(base, filePath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;

  return resolved;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: TreeEntry[];
}

async function buildTree(dirPath: string, relativeTo: string): Promise<TreeEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, relativeTo);
      result.push({ path: relPath, type: "dir", children });
    } else {
      const stat = await fs.stat(fullPath);
      result.push({ path: relPath, type: "file", size: stat.size });
    }
  }

  return result;
}

// --- Endpoints ---

// GET /api/skills — list all skills with metadata from SKILL.md frontmatter
router.get("/api/skills", async (_req, res) => {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      let metadata: Record<string, string> = {};

      try {
        const content = await fs.readFile(skillMdPath, "utf-8");
        metadata = parseFrontmatter(content);
      } catch {
        // SKILL.md may not exist yet
      }

      skills.push({
        name: entry.name,
        displayName: metadata.name || entry.name,
        description: metadata.description || "",
        userInvocable: metadata["user-invocable"] !== "false",
      });
    }

    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: "Failed to list skills" });
  }
});

// GET /api/skills/:name/tree — recursive file tree
router.get("/api/skills/:name/tree", async (req, res) => {
  const { name } = req.params;
  if (!isValidName(name)) {
    res.status(400).json({ error: "Invalid skill name" });
    return;
  }

  const skillDir = safePath(name);
  if (!skillDir) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  try {
    await fs.access(skillDir);
    const files = await buildTree(skillDir, skillDir);
    res.json({ name, files });
  } catch {
    res.status(404).json({ error: "Skill not found" });
  }
});

// GET /api/skills/:name/file?path=SKILL.md — read a file
router.get("/api/skills/:name/file", async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path as string;

  if (!isValidName(name) || !filePath) {
    res.status(400).json({ error: "Invalid skill name or missing path" });
    return;
  }

  const resolved = safePath(name, filePath);
  if (!resolved) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  try {
    const content = await fs.readFile(resolved, "utf-8");
    res.json({ path: filePath, content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// PUT /api/skills/:name/file?path=SKILL.md — write/update a file
router.put("/api/skills/:name/file", async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path as string;
  const { content } = req.body;

  if (!isValidName(name) || !filePath) {
    res.status(400).json({ error: "Invalid skill name or missing path" });
    return;
  }

  if (typeof content !== "string") {
    res.status(400).json({ error: "content (string) is required in body" });
    return;
  }

  const resolved = safePath(name, filePath);
  if (!resolved) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  try {
    await createOrUpdateFile(`.claude/skills/${name}/${filePath}`, content, `Update ${name}/${filePath}`);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    res.json({ ok: true, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write file";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/skills/:name/file?path=scripts/old.ts — delete a file
router.delete("/api/skills/:name/file", async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path as string;

  if (!isValidName(name) || !filePath) {
    res.status(400).json({ error: "Invalid skill name or missing path" });
    return;
  }

  const resolved = safePath(name, filePath);
  if (!resolved) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  try {
    await deleteFile(`.claude/skills/${name}/${filePath}`, `Delete ${name}/${filePath}`);
    await fs.unlink(resolved);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "File not found";
    res.status(500).json({ error: message });
  }
});

// POST /api/skills — create a new skill
router.post("/api/skills", async (req, res) => {
  const { name, description } = req.body;

  if (!name || !isValidName(name)) {
    res.status(400).json({ error: "Invalid skill name. Use lowercase letters, numbers, and hyphens only." });
    return;
  }

  const skillDir = path.join(SKILLS_DIR, name);

  try {
    await fs.access(skillDir);
    res.status(409).json({ error: "Skill already exists" });
    return;
  } catch {
    // does not exist — good
  }

  const skillMd = `---\nname: ${name}\ndescription: ${description || ""}\nuser-invocable: true\n---\n\n# ${name}\n\nDescribe your skill instructions here.\n`;

  try {
    await createOrUpdateFile(`.claude/skills/${name}/SKILL.md`, skillMd, `Create skill ${name}`);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");
    res.status(201).json({ ok: true, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create skill";
    res.status(500).json({ error: message });
  }
});

// DELETE /api/skills/:name — delete entire skill folder
router.delete("/api/skills/:name", async (req, res) => {
  const { name } = req.params;

  if (!isValidName(name)) {
    res.status(400).json({ error: "Invalid skill name" });
    return;
  }

  const skillDir = path.join(SKILLS_DIR, name);

  try {
    await fs.access(skillDir);
    await deleteDirectory(`.claude/skills/${name}`, `Delete skill ${name}`);
    await fs.rm(skillDir, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skill not found";
    res.status(500).json({ error: message });
  }
});

// POST /api/skills/:name/directory?path=scripts — create a subdirectory
router.post("/api/skills/:name/directory", async (req, res) => {
  const { name } = req.params;
  const dirPath = req.query.path as string;

  if (!isValidName(name) || !dirPath) {
    res.status(400).json({ error: "Invalid skill name or missing path" });
    return;
  }

  const resolved = safePath(name, dirPath);
  if (!resolved) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  try {
    await fs.mkdir(resolved, { recursive: true });
    res.status(201).json({ ok: true, path: dirPath });
  } catch {
    res.status(500).json({ error: "Failed to create directory" });
  }
});

export { router as skillsRouter };
