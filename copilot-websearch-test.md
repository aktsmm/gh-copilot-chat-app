# 🤖 Copilot CLI Session

> **Session ID:** `7a56d6c8-ee65-4f81-b4b4-570304e43bd3`
> **Started:** 2026/3/3 2:30:26
> **Duration:** 29s
> **Exported:** 2026/3/3 2:30:56

<sub>⏱️ 2s</sub>

### 👤 User

Web検索を使って、GitHub Copilot CLI の公式ドキュメントURLを1つと、確認した事実を2つ教えてください。必ず参照URLを示してください。

---

<sub>⏱️ 7s</sub>

### 💬 Copilot





---

<sub>⏱️ 19s</sub>

### ✅ `web_search`

**GitHub Copilot CLI official documentation 2025 2026**

<details>
<summary>Arguments</summary>

```json
{
  "query": "GitHub Copilot CLI official documentation 2025 2026"
}
```

</details>

```
{"type":"text","text":{"value":"Here is a summary of the official documentation and key features for GitHub Copilot CLI as of 2025 and 2026:\n\n## Official Documentation\n\n- The latest documentation for GitHub Copilot CLI is available on the [GitHub Copilot Docs portal](https://docs.github.com/en/copilot), which covers installation, setup, features, agent management, and integration with other tools【3:4†source】【3:7†source】.\n- The Copilot CLI repository on GitHub also serves as a key starting point, featuring updates, changelogs, and source code: [github/copilot-cli](https://github.com/github/copilot-cli)【3:5†source】.\n\n## Installation and Setup\n\n- GitHub Copilot CLI can be installed multiple ways:\n  - With npm: `npm install -g @github/copilot`\n  - Via Windows WinGet: `winget install GitHub.Copilot`\n  - With Homebrew (macOS/Linux): `brew install copilot-cli`\n  - Using an install script: `curl -fsSL https://gh.io/copilot-install | bash`\n  - Direct downloads are available from GitHub release artifacts (for all platforms).\n- After installation, authenticate using `/login` or a GitHub personal access token with Copilot permissions【3:7†source】【3:9†source】.\n\n## Features (2025–2026)\n\n- **Agentic Development Workflow**: GitHub Copilot CLI acts as an autonomous coding agent in your terminal. It can plan tasks, run code, execute builds/tests, and iterate until complete.\n    - **Plan Mode**: Outlines the implementation before coding.\n    - **Autopilot Mode**: Allows Copilot to run tasks end-to-end without user approval at each step【3:1†source】.\n- **Multimodal Support**: Choose models from OpenAI, Anthropic, or Google. New models like GPT-5.3-Codex, Claude Opus 4.6, and Gemini 3 Pro are supported【3:1†source】.\n- **Built-in and Custom Agents**: CLI ships with specialized agents (Explore, Task, Plan, Code Review). Custom agents and skills (such as Agent Skills) are supported across VS Code, CLI, and SDK【3:9†source】【3:6†source】.\n- **Parallel Execution**: Use `/fleet` to parallelize tasks and agents.\n- **Background Delegation**: Prefix with `&` to offload work to Copilot in the cloud, keeping your terminal free.\n- **Persistent Memory**: Session history and memory management enable long-running workflows【3:1†source】.\n- **Automation and Scripting**: Flags for automation (e.g., `--silent`, `--share`, `--available-tools`) provide terminal-friendly usage for CI, automation, and reproducibility【3:9†source】.\n- **Enterprise and Policy Controls**: Honors organization policies and integrates with standard GitHub enterprise security protocols.\n\n## Best Practices & Updates\n\n- Tutorials, changelogs, and best practices are regularly updated by GitHub. The [GitHub Blog](https://github.blog/ai-and-ml/github-copilot/) features guides, release notes, and workflow tips specific to Copilot CLI (for example, how to move from plan to code to pull request without leaving the terminal)【3:3†source】.\n- Detailed feature comparison, administrative controls, model management, and agent customization are explained in [feature docs](https://docs.github.com/en/copilot/get-started/features)【3:8†source】.\n\n## Conclusion\n\nGitHub Copilot CLI has matured into a robust terminal-native AI agent designed for developers, supporting both granular and fully autonomous workflows, integration with a wide array of models, and extensibility via custom agents and skills. For detailed, up-to-date instructions or feature exploration, always refer to the [official documentation](https://docs.github.com/en/copilot) and GitHub’s own release notes and changelogs.\n\n**Key Links:**\n- [Official Copilot CLI Docs](https://docs.github.com/en/copilot/how-tos/copilot-cli)\n- [Copilot CLI GitHub Repository](https://github.com/github/copilot-cli)\n- [Installation Guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli)\n- [Latest Copilot CLI Features & Blog](https://github.blog/ai-and-ml/github-copilot/)【3:1†source】【3:3†source】【3:4†source】【3:5†source】【3:7†source】【3:9†source】\n\nIf you have a specific use case or need examples on a workflow, feel free to ask!","annotations":[{"text":"【3:4†source】","start_index":367,"end_index":379,"url_citation":{"title":"GitHub Copilot documentation - GitHub Docs","url":"https://docs.github.com/en/copilot"}},{"text":"【3:7†source】","start_index":379,"end_index":391,"url_citation":{"title":"Installing GitHub Copilot CLI","url":"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli"}},{"text":"【3:5†source】","start_index":576,"end_index":588,"url_citation":{"title":"GitHub - github/copilot-cli: GitHub Copilot CLI brings the power of ...","url":"https://github.com/github/copilot-cli"}},{"text":"【3:7†source】","start_index":1107,"end_index":1119,"url_citation":{"title":"Installing GitHub Copilot CLI","url":"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli"}},{"text":"【3:9†source】","start_index":1119,"end_index":1131,"url_citation":{"title":"GitHub Copilot CLI: Enhanced agents, context management, and new ways ...","url":"https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/"}},{"text":"【3:1†source】","start_index":1509,"end_index":1521,"url_citation":{"title":"GitHub Copilot CLI is now generally available","url":"https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/"}},{"text":"【3:1†source】","start_index":1676,"end_index":1688,"url_citation":{"title":"GitHub Copilot CLI is now generally available","url":"https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/"}},{"text":"【3:9†source】","start_index":1884,"end_index":1896,"url_citation":{"title":"GitHub Copilot CLI: Enhanced agents, context management, and new ways ...","url":"https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/"}},{"text":"【3:6†source】","start_index":1896,"end_index":1908,"url_citation":{"title":"Use Agent Skills in VS Code","url":"https://code.visualstudio.com/docs/copilot/customization/agent-skills"}},{"text":"【3:1†source】","start_index":2188,"end_index":2200,"url_citation":{"title":"GitHub Copilot CLI is now generally available","url":"https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/"}},{"text":"【3:9†source】","start_index":2377,"end_index":2389,"url_citation":{"title":"GitHub Copilot CLI: Enhanced agents, context management, and new ways ...","url":"https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/"}},{"text":"【3:3†source】","start_index":2860,"end_index":2872,"url_citation":{"title":"The latest on GitHub Copilot - The GitHub Blog","url":"https://github.blog/ai-and-ml/github-copilot/"}},{"text":"【3:8†source】","start_index":3060,"end_index":3072,"url_citation":{"title":"GitHub Copilot features - GitHub Docs","url":"https://docs.github.com/en/copilot/get-started/features"}},{"text":"【3:1†source】","start_index":3899,"end_index":3911,"url_citation":{"title":"GitHub Copilot CLI is now generally available","url":"https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/"}},{"text":"【3:3†source】","start_index":3911,"end_index":3923,"url_citation":{"title":"The latest on GitHub Copilot - The GitHub Blog","url":"https://github.blog/ai-and-ml/github-copilot/"}},{"text":"【3:4†source】","start_index":3923,"end_index":3935,"url_citation":{"title":"GitHub Copilot documentation - GitHub Docs","url":"https://docs.github.com/en/copilot"}},{"text":"【3:5†source】","start_index":3935,"end_index":3947,"url_citation":{"title":"GitHub - github/copilot-cli: GitHub Copilot CLI brings the power of ...","url":"https://github.com/github/copilot-cli"}},{"text":"【3:7†source】","start_index":3947,"end_index":3959,"url_citation":{"title":"Installing GitHub Copilot CLI","url":"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli"}},{"text":"【3:9†source】","start_index":3959,"end_index":3971,"url_citation":{"title":"GitHub Copilot CLI: Enhanced agents, context management, and new ways ...","url":"https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/"}}]},"bing_searches":[{"text":"GitHub Copilot CLI official documentation 2025 2026","url":"https://www.bing.com/search?q=GitHub+Copilot+CLI+official+documentation+2025+2026"}],"annotations":null}
```


---

<sub>⏱️ 29s</sub>

### 💬 Copilot

以下が調査結果です。

---

### 📄 公式ドキュメント URL
- **https://docs.github.com/en/copilot/how-tos/copilot-cli**
  （GitHub Copilot CLI 公式ドキュメントページ）

---

### ✅ 確認した事実 2つ

1. **GitHub Copilot CLI は 2026年2月25日に GA（一般提供）となった。**
   複数のモデル（GPT-5.3-Codex、Claude Opus 4.6、Gemini 3 Pro など）をサポートし、Plan Mode や Autopilot Mode といった自律的な開発ワークフローが利用可能です。
   - 参照: https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/

2. **インストール方法は npm / WinGet / Homebrew / インストールスクリプトなど複数用意されている。**
   例: `npm install -g @github/copilot`、`winget install GitHub.Copilot`、`brew install copilot-cli` など。
   - 参照: https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli

---

<sub>Generated by [GitHub Copilot CLI](https://github.com/features/copilot/cli)</sub>
