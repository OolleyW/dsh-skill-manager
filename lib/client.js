/**
 * dsh-skill-manager — client half.
 *
 * 1. Registers a "技能 / Skills" settings section that lists every installed
 *    skill (via GET /api/skill-admin/list) and offers a delete button for
 *    user-installed skills (POST /api/skill-admin/remove).
 * 2. Registers a skill-picker button into `conversation.input.left` (the tool
 *    row beside the access-mode control). Picking a skill inserts `/name ` into
 *    the draft, reusing the host's slash pipeline to load the skill.
 */
window.__ModuleLoader__.load({
  id: "dsh-skill-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var createElement = React.createElement;

    var Button = primitives.Button;
    var Menu = primitives.Menu;
    var Tooltip = primitives.Tooltip;
    var IconSkillOutline16 = primitives.IconSkillOutline16;
    var IconTrashOutline16 = primitives.IconTrashOutline16;
    var IconRefreshOutline14 = primitives.IconRefreshOutline14;
    var IconSearchOutline16 = primitives.IconSearchOutline16;

    var NS = "skill-manager";

    var zh = {
      nav: "技能",
      title: "技能",
      intro: "这里列出了所有已安装的技能。用户安装的技能可以删除；内置技能为只读。",
      refresh: "刷新",
      loading: "正在读取技能…",
      empty: "没有已安装的技能。",
      error: "无法读取技能列表。",
      search: "搜索技能",
      delete: "删除",
      confirmTitle: "确认删除",
      confirmText: "将删除技能文件",
      confirm: "确认删除",
      cancel: "取消",
      deleting: "删除中…",
      deleted: "已删除",
      deleteFailed: "删除失败",
      readonly: "只读",
      pickerTitle: "引用技能",
      pickerEmpty: "当前会话没有可用技能",
    };

    var en = {
      nav: "Skills",
      title: "Skills",
      intro: "Every installed skill is listed here. User-installed skills can be deleted; bundled skills are read-only.",
      refresh: "Refresh",
      loading: "Reading skills…",
      empty: "No skills are installed.",
      error: "Could not read the skill list.",
      search: "Search skills",
      delete: "Delete",
      confirmTitle: "Confirm deletion",
      confirmText: "This deletes the skill file",
      confirm: "Delete",
      cancel: "Cancel",
      deleting: "Deleting…",
      deleted: "Deleted",
      deleteFailed: "Delete failed",
      readonly: "Read-only",
      pickerTitle: "Reference a skill",
      pickerEmpty: "No skills available in this session",
    };

    var ZH_DESCRIPTIONS = {
      "academic-paper": "12 智能体学术论文写作流水线。支持 11 种模式（全文/计划/大纲/修订/修订教练/摘要/文献综述/格式转换/引用检查/披露/反驳审计），6 种论文类型、5 种引用格式，输出 LaTeX/DOCX/PDF。",
      "academic-paper-reviewer": "多视角学术论文评审，动态评审人设。模拟 5 位独立审稿人（期刊契合审稿人 + 3 位同行评审 + 魔鬼代言人），支持完整评审、复审、快速评估、方法论聚焦、苏格拉底引导与校准模式。",
      "academic-pipeline": "完整学术研究流水线编排：研究 → 写作 → 完整性检查 → 评审 → 修订 → 复审 → 再修订 → 终检 → 定稿，10 阶段工作流，强制完整性校验与两阶段同行评审。",
      "deep-research": "通用深度研究智能体团队，13 智能体流水线。8 种模式：完整研究、快速简报、论文评审、文献综述、事实核查、三方文献扫描、苏格拉底引导对话、系统综述（可选 meta 分析）。",
      "my-coffee": "瑞幸咖啡点单助手。下单瑞幸咖啡、搜索门店/商品、查询取餐码/订单状态、取消订单；提到瑞幸、luckin、咖啡、果茶、轻乳茶、果蔬茶、柠檬茶、点单、门店、取餐码时使用。",
      "paper-writer": "基于作者自有材料撰写可发表论文正文，从单段到整篇，覆盖 STEM 与非 STEM 领域。每条事实溯源到用户输入、核实检索或领域常识，引用经独立验证，交付零占位符的干净文稿。",
      "scipilot-cite-skill": "SciPilot 文献检索与引用插入。模式 A：读取 Word/LaTeX 论文并插入引用；模式 B：根据一段话/观点输出支撑文献。经 Semantic Scholar、OpenAlex、Crossref 三源检索并交叉验证 DOI，支持 IEEE/APA/Nature/Vancouver/GB-T-7714 等格式。",
      "scipilot-writing-skill": "SciPilot 学术写作与润色。中英互译润色、缩写/扩写、逻辑检查、去 AI 味、逐章节起草、图表标题、实验结果分析、审稿人自检、cover letter、rebuttal 回复等全链路写作任务，带写作质量证据链自检。",
    };

    var CSS =
      ".dsm-section{width:100%;min-width:0;max-width:780px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:14px}" +
      ".dsm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}" +
      ".dsm-title,.dsm-intro{margin:0}" +
      ".dsm-title{font-size:19px;font-weight:650;line-height:27px;letter-spacing:-.01em}" +
      ".dsm-intro{max-width:640px;color:var(--dsw-alias-label-tertiary);margin-top:4px;font-size:13px;line-height:20px}" +
      ".dsm-toolbar{display:flex;align-items:center;gap:10px}" +
      ".dsm-search{position:relative;display:flex;align-items:center}" +
      ".dsm-search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:32px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 10px 0 32px;font-size:13px;width:220px}" +
      ".dsm-search input:focus-visible{border-color:var(--dsw-alias-state-business-primary)}" +
      ".dsm-search svg{position:absolute;left:9px;color:var(--dsw-alias-label-tertiary);pointer-events:none}" +
      ".dsm-notice{margin:0;font-size:13px;line-height:20px}" +
      ".dsm-notice-ok{color:var(--dsw-alias-state-success-primary, #22c55e)}" +
      ".dsm-notice-error{color:var(--dsw-alias-state-error-primary)}" +
      ".dsm-status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}" +
      ".dsm-error{color:var(--dsw-alias-state-error-primary)}" +
      ".dsm-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}" +
      ".dsm-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:12px}" +
      ".dsm-card-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}" +
      ".dsm-card-name{font-size:14px;font-weight:600;line-height:22px;word-break:break-all}" +
      ".dsm-card-desc{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}" +
      ".dsm-card-meta{display:flex;align-items:center;gap:8px;margin-top:2px}" +
      ".dsm-tag{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px}" +
      ".dsm-tag-ro{color:var(--dsw-alias-label-tertiary)}" +
      ".dsm-card-actions{flex:none;display:flex;align-items:center;gap:8px}" +
      ".dsm-confirm{display:flex;align-items:center;gap:8px;flex:none}" +
      ".dsm-confirm-text{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:220px}" +
      ".dsm-picker-trigger{min-width:0;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}" +
      ".dsm-picker-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dsm-picker-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}" +
      ".dsm-picker-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}" +
      ".dsm-menu-row{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-width:0}" +
      ".dsm-menu-row::before{content:\"\";position:absolute;top:-16px;right:-12px;bottom:-16px;left:-12px}" +
      ".dsm-menu-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";

    // ---- settings section -------------------------------------------------

    function SkillManagerSection(props) {
      var t = props.t;
      var _s = useState({ status: "loading", skills: [], error: null });
      var state = _s[0];
      var setState = _s[1];
      var _confirm = useState(null);
      var confirmName = _confirm[0];
      var setConfirmName = _confirm[1];
      var _busy = useState(null);
      var busy = _busy[0];
      var setBusy = _busy[1];
      var _query = useState("");
      var query = _query[0];
      var setQuery = _query[1];
      var _notice = useState(null);
      var notice = _notice[0];
      var setNotice = _notice[1];

      var load = function () {
        setState({ status: "loading", skills: [], error: null });
        fetch("/api/skill-admin/list")
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (json && json.ok) setState({ status: "ready", skills: json.skills || [], error: null });
            else setState({ status: "error", skills: [], error: (json && json.error) || "unknown error" });
          })
          .catch(function (e) {
            setState({ status: "error", skills: [], error: String((e && e.message) || e) });
          });
      };

      useEffect(load, []);

      var remove = function (name, source) {
        setBusy(name);
        setNotice(null);
        fetch("/api/skill-admin/remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name, source: source }),
        })
          .then(function (r) { return r.json(); })
          .then(function (json) {
            setBusy(null);
            setConfirmName(null);
            if (json && json.ok) {
              setNotice({ kind: "ok", text: t("deleted") + ": " + name });
              load();
            } else {
              setNotice({ kind: "error", text: (json && json.error) || t("deleteFailed") });
            }
          })
          .catch(function (e) {
            setBusy(null);
            setConfirmName(null);
            setNotice({ kind: "error", text: String((e && e.message) || e) });
          });
      };

      var filtered = useMemo(function () {
        if (state.status !== "ready") return [];
        var q = query.trim().toLowerCase();
        return state.skills.filter(function (s) {
          if (q === "") return true;
          return (s.name || "").toLowerCase().indexOf(q) !== -1 || (s.description || "").toLowerCase().indexOf(q) !== -1;
        });
      }, [query, state]);

      var head = createElement("div", { className: "dsm-head" },
        createElement("div", {},
          createElement("h2", { className: "dsm-title" }, t("title")),
          createElement("p", { className: "dsm-intro" }, t("intro"))
        )
      );

      var toolbar = createElement("div", { className: "dsm-toolbar" },
        state.status === "ready" && createElement("label", { className: "dsm-search" },
          createElement(IconSearchOutline16, { size: 14, "aria-hidden": true }),
          createElement("input", {
            type: "search",
            value: query,
            placeholder: t("search"),
            "aria-label": t("search"),
            onChange: function (e) { setQuery(e.target.value); },
          })
        ),
        createElement(Button, { variant: "outline", size: "sm", icon: createElement(IconRefreshOutline14, {}), onClick: load }, t("refresh"))
      );

      var body = null;
      if (state.status === "loading") {
        body = createElement("p", { className: "dsm-status" }, t("loading"));
      } else if (state.status === "error") {
        body = createElement("p", { className: "dsm-status dsm-error", role: "alert" }, t("error") + " " + (state.error || ""));
      } else if (filtered.length === 0) {
        body = createElement("p", { className: "dsm-status" }, state.skills.length === 0 ? t("empty") : t("search") + " —");
      } else {
        body = createElement("ul", { className: "dsm-list" },
          filtered.map(function (s) {
            var deleting = busy === s.name;
            var confirming = confirmName === s.name;
            var actions = confirming
              ? createElement("div", { className: "dsm-confirm" },
                  createElement("span", { className: "dsm-confirm-text" }, t("confirmText") + " " + s.name),
                  createElement(Button, { variant: "primary", size: "sm", disabled: deleting, onClick: function () { remove(s.name, s.source); } }, deleting ? t("deleting") : t("confirm")),
                  createElement(Button, { variant: "ghost", size: "sm", disabled: deleting, onClick: function () { setConfirmName(null); } }, t("cancel"))
                )
              : s.deletable
                ? createElement(Button, { variant: "outline", size: "sm", icon: createElement(IconTrashOutline16, { size: 14 }), disabled: busy !== null, onClick: function () { setConfirmName(s.name); setNotice(null); } }, t("delete"))
                : createElement("span", { className: "dsm-tag dsm-tag-ro" }, t("readonly"));

            return createElement("li", { key: s.name, className: "dsm-card" },
              createElement("div", { className: "dsm-card-body" },
                createElement("div", { className: "dsm-card-name" }, s.name),
                s.description ? createElement("p", { className: "dsm-card-desc" }, s.description) : null,
                createElement("div", { className: "dsm-card-meta" },
                  createElement("span", { className: "dsm-tag" }, s.sourceLabel || s.source)
                )
              ),
              createElement("div", { className: "dsm-card-actions" }, actions)
            );
          })
        );
      }

      return createElement("div", { className: "dsm-section" },
        head,
        toolbar,
        notice !== null && createElement("p", { className: "dsm-notice " + (notice.kind === "ok" ? "dsm-notice-ok" : "dsm-notice-error"), role: "status" }, notice.text),
        body
      );
    }

    // ---- composer skill picker button -------------------------------------

    function SkillPickerButton(props) {
      var t = props.t;
      var sessionId = props.sessionId;
      var listSkills = props.listSkills;
      var useInput = props.useInput;
      var inputActions = props.inputActions;

      var draft = useInput ? useInput(function (s) { return s.draft; }) : "";
      var _open = useState(false);
      var open = _open[0];
      var setOpen = _open[1];
      var _skills = useState([]);
      var skills = _skills[0];
      var setSkills = _skills[1];

      useEffect(function () {
        if (!open) return;
        var controller = new AbortController();
        Promise.resolve()
          .then(function () { return listSkills(sessionId, controller.signal); })
          .then(function (response) {
            if (controller.signal.aborted) return;
            if (response && response.result && response.result.ok) setSkills(response.result.value.skills || []);
            else setSkills([]);
          })
          .catch(function () { if (!controller.signal.aborted) setSkills([]); });
        return function () { controller.abort(); };
      }, [open, sessionId, listSkills]);

      var items = skills.length > 0
        ? skills.map(function (s) {
            var row = createElement("span", { className: "dsm-menu-row" },
              createElement(IconSkillOutline16, { size: 14 }),
              createElement("span", { className: "dsm-menu-name" }, s.name)
            );
            var desc = ZH_DESCRIPTIONS[s.name] || s.description;
            var label = desc
              ? createElement(Tooltip, { label: desc, side: "right", maxWidth: 320, delayMs: 300 }, row)
              : row;
            return { id: s.name, label: label };
          })
        : [{ type: "label", id: "empty", text: t("pickerEmpty") }];

      var pick = function (name) {
        setOpen(false);
        if (!inputActions || typeof inputActions.setDraft !== "function") return;
        var current = typeof draft === "string" ? draft : "";
        inputActions.setDraft(current + "/" + name + " ");
      };

      var anchor = createElement(Tooltip, {
        label: t("pickerTitle"),
        side: "top",
        delayMs: 500,
      },
        createElement("button", {
          type: "button",
          className: "dsm-picker-trigger",
          "aria-label": t("pickerTitle"),
          onClick: function () { setOpen(!open); },
        },
          createElement(IconSkillOutline16, { size: 14 }),
          createElement("span", null, t("nav"))
        )
      );

      return createElement(Menu, {
        open: open,
        items: items,
        onSelect: pick,
        onClose: function () { setOpen(false); },
        side: "top",
        align: "start",
        anchor: anchor,
      });
    }

    // ---- plugin body ------------------------------------------------------

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-skill-manager: dictionaries");

      var t = ctx.locale.bind(NS);

      ctx.effect(function () {
        var style = document.createElement("style");
        style.setAttribute("data-plugin-css", "dsh-skill-manager");
        style.textContent = CSS;
        document.head.appendChild(style);
        return function () { try { style.remove(); } catch (e) {} };
      }, "dsh-skill-manager: css");

      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "skills",
          order: 30,
          label: function () { return t("nav"); },
          inject: function () { return { t: t }; },
        }, SkillManagerSection);
      });

      ctx.slots.inject("conversation.input.left", function () {
        return ctx.slots.register({
          name: "conversation.input.left",
          id: "skill-picker",
          order: 100,
          label: function () { return t("nav"); },
          inject: function () {
            return {
              t: t,
              listSkills: function (sessionId, signal) {
                return ctx.get("connection").api.skills.list({ sessionId: sessionId }, signal);
              },
            };
          },
        }, SkillPickerButton);
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "connection"];
    return module.exports;
  },
});
