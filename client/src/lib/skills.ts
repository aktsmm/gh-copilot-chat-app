import type { SkillTemplate, UiLanguage } from "./types";

interface SkillSeed {
  id: string;
  title: Record<UiLanguage, string>;
  description: Record<UiLanguage, string>;
  prompt: Record<UiLanguage, string>;
  recommendedModel?: string;
}

const SKILL_SEEDS: SkillSeed[] = [
  {
    id: "deep-research",
    title: {
      ja: "Deep Research (CLI/Fleet)",
      en: "Deep Research (CLI/Fleet)",
    },
    description: {
      ja: "Copilot CLI /research 相当の調査フローを実行",
      en: "Run a Copilot CLI /research-like flow with Fleet",
    },
    prompt: {
      ja: "このテーマを深く調査してください。要件整理→調査計画→主要論点の比較→推奨案→残リスクの順で、根拠と前提を明示してまとめてください。必要に応じて情報不足点も列挙してください。",
      en: "Perform deep research on this topic. Structure the output as requirements, research plan, key comparison points, recommendation, and remaining risks. Explicitly state assumptions and evidence, and list information gaps when needed.",
    },
    recommendedModel: "gpt-5",
  },
  {
    id: "security-review",
    title: {
      ja: "Security Review",
      en: "Security Review",
    },
    description: {
      ja: "脅威・悪用経路・対策を優先度付きでレビュー",
      en: "Review threats, abuse paths, and mitigations by priority",
    },
    prompt: {
      ja: "この変更をセキュリティ観点でレビューしてください。攻撃面、悪用シナリオ、影響、再現手順、修正案、優先度を表形式で整理してください。",
      en: "Review this change from a security perspective. Provide attack surface, abuse scenarios, impact, reproduction steps, fix proposal, and priority in a table.",
    },
    recommendedModel: "gpt-5.3-codex",
  },
  {
    id: "test-design",
    title: {
      ja: "Test Design",
      en: "Test Design",
    },
    description: {
      ja: "境界値・失敗系まで含めたテスト観点を設計",
      en: "Design test coverage including boundaries and failure paths",
    },
    prompt: {
      ja: "この機能に対するテスト設計を作成してください。正常系、異常系、境界値、回帰観点、優先実行順を提案してください。",
      en: "Create a test design for this feature. Include happy paths, error paths, boundary values, regression checks, and execution priority.",
    },
    recommendedModel: "gpt-4.1",
  },
  {
    id: "refactor-plan",
    title: {
      ja: "Refactor Plan",
      en: "Refactor Plan",
    },
    description: {
      ja: "責務分離しながら小さく安全に改善計画を作成",
      en: "Build an incremental and safe refactor plan",
    },
    prompt: {
      ja: "このコードのリファクタ計画を作ってください。責務分離、依存方向、段階的移行、リスクと検証手順を含めてください。",
      en: "Create a refactor plan for this code including responsibility split, dependency direction, incremental migration steps, risks, and validation steps.",
    },
    recommendedModel: "claude-sonnet-4",
  },
  {
    id: "mcp-web-setup",
    title: {
      ja: "MCP Setup Template (Web)",
      en: "MCP Setup Template (Web)",
    },
    description: {
      ja: "Web経由MCP（HTTP/SSE）を最短で接続設定",
      en: "Quickly configure web-based MCP (HTTP/SSE)",
    },
    prompt: {
      ja: "Web経由のMCPサーバーを接続したいです。次の順で支援してください: 1) まず不足情報だけ質問（URL、認証方式、必要ヘッダー） 2) その回答を前提に最小構成の設定例を提示 3) 接続確認手順と失敗時チェックリストを提示。出力はコピペしやすいJSON設定と短い手順でお願いします。",
      en: "I want to connect a web-based MCP server. Help in this order: 1) ask only missing inputs first (URL, auth method, required headers), 2) provide a minimal working config based on my answers, 3) provide a short verification flow and failure checklist. Output copy-paste friendly JSON config and concise steps.",
    },
    recommendedModel: "gpt-5",
  },
  {
    id: "mcp-local-setup",
    title: {
      ja: "MCP Setup Template (Local)",
      en: "MCP Setup Template (Local)",
    },
    description: {
      ja: "ローカルMCP（コマンド実行型）の起動設定を作成",
      en: "Create local command-based MCP startup config",
    },
    prompt: {
      ja: "ローカルMCPサーバーを接続したいです。次の順で支援してください: 1) OS・実行コマンド・必要環境変数の不足情報を質問 2) 最小構成の設定例を提示（Windows向けを優先） 3) 起動確認手順とトラブル時の切り分けを提示。出力はコピペしやすいJSON設定と短い手順でお願いします。",
      en: "I want to connect a local MCP server. Help in this order: 1) ask missing inputs (OS, launch command, required env vars), 2) provide a minimal config (prioritize Windows), 3) provide startup verification and troubleshooting steps. Output copy-paste friendly JSON config and concise steps.",
    },
    recommendedModel: "gpt-5",
  },
];

export function getSkills(language: UiLanguage): SkillTemplate[] {
  return SKILL_SEEDS.map((skill) => ({
    id: skill.id,
    title: skill.title[language],
    description: skill.description[language],
    prompt: skill.prompt[language],
    recommendedModel: skill.recommendedModel,
  }));
}
