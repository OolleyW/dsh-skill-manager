/**
 * dsh-skill-manager — host half.
 *
 * Lists and deletes installed skills by scanning the user skill roots directly
 * (`~/.dsh/skills` and `~/.agents/skills`), matching the `dsh-skill-filesystem`
 * layout. We deliberately do NOT use the `skills` registry here: that registry
 * layers its providers per agent-preset scope, so a host-plane `list({})` sees
 * an empty global layer. Direct filesystem scanning is the reliable source of
 * truth for a global "manage my skills" admin surface.
 *
 *   GET  /api/skill-admin/list    — list skills from both user roots
 *   POST /api/skill-admin/remove  — delete one skill (dir bundle or flat .md)
 *
 * Both endpoints are loopback-only (the settings page is a local admin view).
 */
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const name = "dsh-skill-manager";
export const inject = ["webServer"];

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BODY_BYTES = 16 * 1024;

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function agentsHome() {
  return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}

/** Roots this admin surface manages. Both are user-owned and deletable. */
const ROOTS = [
  { source: "user-dsh", sourceLabel: "~/.dsh/skills", path: () => join(dshHome(), "skills") },
  { source: "user-agents", sourceLabel: "~/.agents/skills", path: () => join(agentsHome(), "skills") },
];

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body exceeds 16 KiB");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? {} : JSON.parse(text);
}

/** Chinese display descriptions for the known skills (overrides frontmatter `description:`). */
const ZH_DESCRIPTIONS = {
  "academic-paper": "12 智能体学术论文写作流水线。支持 11 种模式（全文/计划/大纲/修订/修订教练/摘要/文献综述/格式转换/引用检查/披露/反驳审计），6 种论文类型、5 种引用格式，输出 LaTeX/DOCX/PDF。",
  "academic-paper-reviewer": "多视角学术论文评审，动态评审人设。模拟 5 位独立审稿人（期刊契合审稿人 + 3 位同行评审 + 魔鬼代言人），支持完整评审、复审、快速评估、方法论聚焦、苏格拉底引导与校准模式。",
  "academic-pipeline": "完整学术研究流水线编排：研究 → 写作 → 完整性检查 → 评审 → 修订 → 复审 → 再修订 → 终检 → 定稿，10 阶段工作流，强制完整性校验与两阶段同行评审。",
  "deep-research": "通用深度研究智能体团队，13 智能体流水线。8 种模式：完整研究、快速简报、论文评审、文献综述、事实核查、三方文献扫描、苏格拉底引导对话、系统综述（可选 meta 分析）。",
  "my-coffee": "瑞幸咖啡点单助手。下单瑞幸咖啡、搜索门店/商品、查询取餐码/订单状态、取消订单；提到瑞幸、luckin、咖啡、果茶、轻乳茶、果蔬茶、柠檬茶、点单、门店、取餐码时使用。",
  "paper-writer": "基于作者自有材料撰写可发表论文正文，从单段到整篇，覆盖 STEM 与非 STEM 领域。每条事实溯源到用户输入、核实检索或领域常识，引用经独立验证，交付零占位符的干净文稿。",
  "scipilot-cite-skill": "SciPilot 文献检索与引用插入。模式 A：读取 Word/LaTeX 论文并插入引用；模式 B：根据一段话/观点输出支撑文献。经 Semantic Scholar、OpenAlex、Crossref 三源检索并交叉验证 DOI，支持 IEEE/APA/Nature/Vancouver/GB-T-7714 等格式。",
  "scipilot-writing-skill": "SciPilot 学术写作与润色。中英互译润色、缩写/扩写、逻辑检查、去 AI 味、逐章节起草、图表标题、实验结果分析、审稿人自检、cover letter、rebuttal 回复等全链路写作任务，带写作质量证据链自检。",
};

/** Pull the `description:` value out of a skill file's frontmatter (single-line or `>-`/`|` block). */
function extractDescription(raw) {
  const firstNewline = raw.indexOf("\n");
  if (firstNewline < 0) return "";
  if (raw.slice(0, firstNewline).replace(/\r$/, "") !== "---") return "";
  const lines = raw.slice(firstNewline + 1).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "---") break;
    const match = /^description:\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    if (value !== "" && !/^[>|][+-]?$/.test(value)) {
      return value.replace(/^["']|["']$/g, "");
    }
    const parts = [];
    for (let j = i + 1; j < lines.length; j++) {
      const cont = lines[j];
      if (cont === "---") break;
      if (cont.trim() === "") continue;
      if (/^\S/.test(cont)) break;
      parts.push(cont.trim());
    }
    return parts.join(" ").trim();
  }
  return "";
}

async function readDescription(path) {
  try {
    return extractDescription(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

async function scanRoot(rootPath, source, sourceLabel) {
  const skills = [];
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return skills; // root absent = empty, not an error
  }
  for (const entry of entries) {
    if (entry.name === ".system") continue;
    if (entry.isDirectory()) {
      const description = ZH_DESCRIPTIONS[entry.name] ?? await readDescription(join(rootPath, entry.name, "SKILL.md"));
      skills.push({ name: entry.name, description, source, sourceLabel, deletable: true });
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = entry.name.slice(0, -3);
      if (!SKILL_NAME.test(name)) continue;
      const description = ZH_DESCRIPTIONS[name] ?? await readDescription(join(rootPath, entry.name));
      skills.push({ name, description, source, sourceLabel, deletable: true });
    }
  }
  return skills;
}

async function listSkills() {
  const skills = [];
  for (const root of ROOTS) {
    skills.push(...await scanRoot(root.path(), root.source, root.sourceLabel));
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** Resolve a skill name+source to the directory (bundle) or file (flat) to delete. */
async function findSkillTarget(name, source) {
  const root = ROOTS.find((r) => r.source === source);
  if (root === undefined) return undefined;
  const rootPath = root.path();
  const bundleDir = join(rootPath, name);
  const bundleMd = join(bundleDir, "SKILL.md");
  const flatMd = join(rootPath, `${name}.md`);
  try {
    if ((await stat(bundleMd)).isFile()) return bundleDir;
  } catch {}
  try {
    if ((await stat(flatMd)).isFile()) return flatMd;
  } catch {}
  return undefined;
}

export function apply(ctx) {
  const webServer = ctx.webServer;

  ctx.effect(() => {
    const listRoute = webServer.register({
      kind: "exact",
      path: "/api/skill-admin/list",
      async handler(req, res) {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!isLoopback(req.socket.remoteAddress)) {
          writeJson(res, 403, { ok: false, error: "skill-admin is loopback-only" });
          return;
        }
        try {
          writeJson(res, 200, { ok: true, skills: await listSkills() });
        } catch (error) {
          writeJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    });

    const removeRoute = webServer.register({
      kind: "exact",
      path: "/api/skill-admin/remove",
      async handler(req, res) {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!isLoopback(req.socket.remoteAddress)) {
          writeJson(res, 403, { ok: false, error: "skill-admin is loopback-only" });
          return;
        }
        let payload;
        try {
          payload = await readBody(req);
        } catch {
          writeJson(res, 400, { ok: false, error: "invalid JSON body" });
          return;
        }
        const name = typeof payload.name === "string" ? payload.name : "";
        const source = typeof payload.source === "string" ? payload.source : "";
        if (!SKILL_NAME.test(name)) {
          writeJson(res, 400, { ok: false, error: `invalid skill name ${JSON.stringify(name)}` });
          return;
        }
        try {
          const target = await findSkillTarget(name, source);
          if (target === undefined) {
            writeJson(res, 404, { ok: false, error: `skill "${name}" not found in ${source || "known roots"}` });
            return;
          }
          await rm(target, { recursive: true, force: true });
          writeJson(res, 200, { ok: true, removed: name, target });
        } catch (error) {
          writeJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    });

    return () => {
      listRoute();
      removeRoute();
    };
  }, "dsh-skill-manager: routes");
}
