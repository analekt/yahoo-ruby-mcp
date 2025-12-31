# Yahoo! ふりがな API MCP サーバ

Yahoo! JAPAN テキスト解析の[ふりがなAPI（V2）](https://developer.yahoo.co.jp/webapi/jlp/furigana/v2/furigana.html)を利用したMCPサーバです。

日本語テキストにふりがな（ひらがな読み）やローマ字を付けることができます。

## 必要な環境

- Node.js 18以上
- Yahoo! JAPAN デベロッパーネットワークの Client ID（アプリケーションID）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ビルド

```bash
npm run build
```

## Claude Desktop での設定

`claude_desktop_config.json` に以下を追加してください：

```json
{
  "mcpServers": {
    "yahoo-furigana": {
      "command": "node",
      "args": ["/path/to/yahoo-ruby-mcp/dist/index.js"],
      "env": {
        "YAHOO_CLIENT_ID": "あなたのClient ID"
      }
    }
  }
}
```

`/path/to/yahoo-ruby-mcp` は実際のパスに置き換えてください。

## 提供するツール

### add_furigana

日本語テキストにふりがなを付けます。

#### パラメータ

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| `text` | string | ○ | ふりがなを付けたい日本語テキスト |
| `grade` | number | - | 学年指定（1-8）。指定した学年までに習う漢字にはふりがなを付けません |
| `include_roman` | boolean | - | ローマ字も含めた詳細出力にするか（デフォルト: false） |

#### grade の値

| 値 | 対象 |
|----|------|
| 1 | 小学1年生までに習う漢字 |
| 2 | 小学2年生までに習う漢字 |
| 3 | 小学3年生までに習う漢字 |
| 4 | 小学4年生までに習う漢字 |
| 5 | 小学5年生までに習う漢字 |
| 6 | 小学6年生までに習う漢字 |
| 7 | 中学生までに習う漢字 |
| 8 | それ以上 |

#### 使用例

```
入力: "漢字の読み方を教えてください"
出力: "漢字（かんじ）の読（よ）み方（かた）を教（おし）えてください"
```

## 制限事項

- 最大リクエストサイズ: 4KB
- Yahoo! JAPAN APIの利用規約に従ってください

## ライセンス

MIT
