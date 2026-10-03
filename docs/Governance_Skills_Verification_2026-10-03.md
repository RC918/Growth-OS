# 專案自治 skills：驗證與 discovery 邊界

本次 Owner 任務只建立治理技能，不開始產品工程、不改 DB／runtime flags／production，不重試父已被安全工具拒絕的 mutation。起始 HEAD `8b9cdf5fd6683877e1b02b1a31869372bb66be5d`，分支 `feat/passwordless-workspace`。repo 原無 `AGENTS.md`、`.codex/skills` 或 `.agents/skills`，因此沒有覆蓋既有指引。

## 唯一來源與相容入口

| 名稱 | 唯一內容來源 | discovery 相容入口 |
|---|---|---|
| mission-guardrail | `.codex/skills/mission-guardrail/SKILL.md` | `.agents/skills/mission-guardrail` → `../../.codex/skills/mission-guardrail` |
| recovery-reconciliation | `.codex/skills/recovery-reconciliation/SKILL.md` | `.agents/skills/recovery-reconciliation` → `../../.codex/skills/recovery-reconciliation` |
| engineering-executor | `.codex/skills/engineering-executor/SKILL.md` | `.agents/skills/engineering-executor` → `../../.codex/skills/engineering-executor` |

沒有暗換使用者指定的 `.codex/skills` 路徑，也沒有複製第二套內容。[OpenAI 官方技能文件](https://developers.openai.com/codex/skills)說明 repository discovery 使用 `.agents/skills` 並支援 symlink skill folders；本次僅據此加三個連到唯一來源的相容入口。root `AGENTS.md` 只保留主線、技能路由、P3/P4不阻塞與指令／安全優先規則。

## Skill creator 與格式檢查

- `skills.list(authority=executor)` 原始結果為 `skills: []`；cloud catalog 全部分頁沒有 skill-creator。
- 額外檢查 repo／workspace 的 `.agents/skills` 與 `.codex`，並搜尋現有 `/opt/codex`、`/etc/codex`、`/home`：未找到可用 `skill-creator/SKILL.md` 或 `quick_validate.py`。沒有假稱讀過或執行不存在的 validator；採官方文件允許的手動編寫方式。
- Python 3＋PyYAML **6.0.3** 驗證：三份 YAML 均僅有 `name`／非空 `description`，name與目錄一致且為hyphen-case，description不超過1024字元；皆有「何時使用／不應何時使用」「執行規則」「Escalation」；相對連結存在，symlink皆resolve到指定唯一來源。**3/3 PASS**。
- `git diff --check` PASS；frozen SQL/artifacts/hash、所有 `apps/web`／prototype runtime檔案與CI設定均未改。不為純文件工作重跑產品全套測試。

可重現格式驗證（從repo root）：

```sh
python3 - <<'PY'
from pathlib import Path
import re, yaml
for name in ('mission-guardrail','recovery-reconciliation','engineering-executor'):
    p=Path('.codex/skills')/name/'SKILL.md'
    prefix,front,body=p.read_text().split('---',2)
    meta=yaml.safe_load(front)
    assert prefix=='' and set(meta)=={'name','description'}
    assert meta['name']==name and re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*',name)
    assert isinstance(meta['description'],str) and 0<len(meta['description'])<=1024
    assert all(s in body for s in ('何時使用／不應何時使用','執行規則','Escalation'))
    assert (Path('.agents/skills')/name/'SKILL.md').resolve()==p.resolve()
    for target in re.findall(r'\]\(([^)]+)\)',body):
        assert (p.parent/target).exists(),target
    print('PASS',name)
PY
```

## 實際 runtime discovery：未驗收，不能報自動發現 PASS

已做真實 discovery 嘗試，**沒有用filesystem exists替代runtime結果**：

1. 本session executor的 `skills.list({authority:{kind:'executor'}})`，建立相容入口前／後均回 `skills: [], warnings: [], next_cursor: null`。這證明此session catalog未列出它們，不代表其他cwd／新session也一定無法發現。
2. 本機 `codex --version` 為 **0.159.0-alpha.3**。`codex app-server generate-json-schema --out /tmp/growth-codex-schema` 成功，確認真實 `skills/list` 參數包含 `cwds` 與 `forceReload`。預定只送 initialize及 `skills/list(cwds=['/workspace/Growth-OS'], forceReload=true)`，不建立thread／turn、不發模型請求、不新增Cloud task。
3. `codex app-server --stdio` 在初始化前退出：不能在受保護的 `/run/codex-environment/codex-home` 初始化SQLite。僅把CLI支援的 `sqlite_home` 指向 `/tmp/growth-governance-runtime-state` 仍退出。
4. 本機 `strace -f -e trace=file` 定位剩餘原因：對 `/run/codex-environment/codex-home/installation_id` 的 `open(...O_RDWR|O_CREAT...)` 回 **EROFS**。沒有修改受保護home、環境安全設定或替換route來繞過限制。`codex -C /workspace/Growth-OS debug prompt-input` 也以 EROFS退出、JSON輸出0 bytes。因此沒有取得loader的skills清單或模型可見prompt，不能宣稱已注入。

原始本機證據在 `/tmp/growth-skill-discovery.stderr`、`/tmp/growth-codex-discovery.trace`、`/tmp/growth-prompt-codex-only.stderr`；這些暫存檔不是可攜repo交付物，以上已摘錄具體結果。此為 **工具限制＋runtime discovery未驗收**，不是技能格式FAIL，也不是新的產品工程blocker。

父可在下一turn以repo為cwd做既有runtime的只讀skills discovery，確認三個name及實際path，再補驗收。不要只因AGENTS能直接連到檔案就宣稱autodiscovery成功，也不要為驗此項新增Cloudtask或產品任務。本輪到commit/push後停止。

## PR19 更新交接

本child先前GitHub API已回403，遵照指示不重試；由父connector更新既有PR19，保留既有產品變更描述，追加以下段落：

> 新增專案自治技能（治理文件）：mission-guardrail限制非核心maintenance與漂移；recovery-reconciliation區分工具未知與committed state並回原任務；engineering-executor推進最小已授權Core到驗收。三份唯一來源位於`.codex/skills`，`.agents/skills`僅symlink，root AGENTS為精簡路由。YAML／段落／相對連結／symlink檢查3/3 PASS；runtime autodiscovery尚未驗收：session skills.list空，本機CLI loader受唯讀installation_id阻擋，須父下一turn只讀確認。未變更frozen SQL/hash/runtime flags，未執行產品工程、DB或部署。CI由父核終態。
