# Calls の消費電力・パフォーマンス KPI

音声のみでミュートして聞く時間が長い使い方を主対象に、発話中も計測した。比較元は `develop` の `397246f73ce938fb9655789fe33beed3fdfabbe6`。以下の CPU・描画・ポーリングはバッテリー消費の原因を追う代理指標であり、実機の電力量は未計測。

## 実機で判定する消費電力 KPI

各モードの平均消費電力（mWh/h = mW）を変更前の **50% 以下**にする目標を置く。現在の結果はすべて未計測で、半減達成とは判定しない。

| KPI | 固定する使い方 | 目標 | 状態 |
| --- | --- | --- | --- |
| ミュート受信・画面オン | 音声のみ、NSオン、他参加者1人が発話 | 変更前の50%以下 | 未計測 |
| ミュート受信・画面オフ | 上と同じ音声、画面ロック後も受信 | 変更前の50%以下 | 未計測 |
| 発話・NSオン | 同じ音声入力、双方向音声 | 変更前の50%以下 | 未計測 |
| 発話・NSオフ | 同じ音声入力、双方向音声 | 変更前の50%以下 | 未計測 |

同じ端末・OS・ブラウザ・SFU・参加者数・音量・回線で、画面オン時は輝度を固定し、充電せず比較する。開始時の残量と端末温度を揃え、5分のウォームアップ後に20分×3回を交互に測る。電力量を取得できる端末の積算値または電力計から平均電力を求め、中央値と各回の値を残す。画面オフ中の音声継続も別途確認する。同条件の Calls 未接続時との差分も併記し、画面や端末の基礎消費と Calls による増分を把握する。ブラウザのバッテリー残量や iOS の Energy Impact だけから mWh を換算しない。

## ローカルで計測した代理指標

| KPI | 変更前 → 変更後（中央値） | 変更前比 | 判定 |
| --- | --- | --- | --- |
| ミュート CPU / 15秒 | 1.57s → 0.65s | 41.4% | 50%以下を達成 |
| ミュートのマイク処理クロック / 15秒 | 14.997s → 0s | 0% | 停止を達成 |
| ミュートの送信音声 RTP / 15秒 | 762 → 0 packets | 0% | 50%以下を達成 |
| ミュート getStats / 分 | 120 → 0回 | 0% | 停止を達成 |
| listener getStats / 分 | 120 → 0回 | 0% | 停止を達成 |
| 同じ発話集合100イベントの通知合計 | 200 → 1回 | 0.5% | 50%以下を達成 |
| 待機 Dock Paint / 5秒（横向き） | 600 → 0回 | 0% | 50%以下を達成 |
| 発話 Dock Paint / 5秒（横向き） | 900 → 0回 | 0% | 50%以下を達成 |
| 発話・NSオン CPU / 15秒 | 1.68s → 1.65s | 98.2% | 半減未達 |
| 発話・NSオフ CPU / 15秒 | 1.35s → 1.34s | 99.3% | 半減未達 |

発話中の音声 CPU はどちらもほぼ同じだった。JSON の `targetWithinBaseline110` は10%を超える悪化がないかを見る補助指標で、半減目標の達成を意味しない。送信音声 RTP の停止はローカル接続での結果であり、RTCP・WebSocket・SFU接続全体の通信がゼロになるという意味ではない。

CPU は CDP `SystemInfo.getProcessInfo` の全 renderer プロセス CPU 時間差分。Linux x64 / Ryzen 5 5600X / Chromium、390×844 のモバイル viewport で、ウォームアップ4秒、計測15秒、復帰確認2秒を baseline/current 交互に3回実行した。スマホ実機の CPU・GPU・電力や、Misskey 全画面の値ではない。音声 fixture は本番のノイズ抑制モジュールとローカル双方向 WebRTC を使う。SFU・TURN・バックエンドは通らず、マイク取得・音声再生・テスト用 RMS サンプリングも CPU に含まれる。比較元には通報録音モジュールがなく、両方とも録音なしで測定した。

描画は本番 `CallsDock.vue` の CSS を適用した fixture で、844×390（横向き）と390×844（縦向き）を各3回、5秒ずつ計測した。発話リングは2本の scale/rotate アニメーションを維持し、border-radius の連続変化を固定形状にした。Paint 0 は再描画の削減を表し、コンポジタや GPU の仕事がなくなったことを意味しない。縦向きでは元からリングが非表示で、待機時の Paint は両方0だった。

リアクティブ更新は同じ revision・同じ2人の発話集合を100イベント連続で流した値。最初の発話集合への更新1回は必要な更新として残る。順序だけ変わる場合も同じ集合として扱い、参加者が変わるイベントは従来どおり反映する。

## 音声品質と応答性の制約

発話時は getStats と発話通知を500ms周期（120回/分）で維持する。最初の検知は500ms、無音への変更も次の500msサンプルで検知することを unit test で確認した。通知回数を減らして発話表示の遅れを増やす変更はしていない。

すべての音声計測回で、受信 RTP と再生が継続し、発話時に処理後の送信音声と相手側デコード音声の RMS 最大値がそれぞれ0.001を超えることを確認する。ミュート用の入力は440Hzの合成音で、RNNoise に抑制されるため、解除後の音声確認では NS を一時的にオフにして同じ出力トラックの入力・受信音声と送信 RTP が戻ることを確認した。NSオンで声が届くことは別の発話 fixture で確認している。これは音声経路が生きているという確認であり、聞き取りやすさや実機での音切れの保証ではない。RTP 件数・送信バイト数は JSON に残し、発話中の必要な音声通信を削減目標にはしない。ブラウザが提供した packet send delay、jitter buffer、concealed samples も保存し、未提供の encode time などは補完しない。

## 結果と再現

- [ミュート音声の生データ](calls-performance-results.json)
- [発話・NSオンの生データ](calls-performance-results-speaking.json)
- [発話・NSオフの生データ](calls-performance-results-speaking-bypass.json)
- [描画の生データ](calls-dock-performance-results.json)
- [リアクティブ更新の生データ](calls-reactivity-performance-results.json)
- [ポーリングの生データ](calls-polling-performance-results.json)

各 JSON に測定条件・source SHA256・生の各回の値を残した。音声入力は Sony SilentCipher の [test.wav](https://github.com/sony/silentcipher/blob/d46d7d0893a583d8968ab3a6626e2289faec9152/examples/colab/test.wav)（MIT リポジトリ内の音声）を30秒の48kHz/mono/PCM16に変換したもの。変換後の SHA256 は `65064af610a648262843a300fce2b9f7d75be3aa36f175233b8d531c50c60c98`。音声ファイル自体はコミットしていない。別の WAV を使う場合は両方で同じ入力を指定する。

```bash
mkdir -p /tmp/calls-battery-pr-baseline
for file in calls-noise-suppression.ts calls-media.ts; do
  git show 397246f73ce938fb9655789fe33beed3fdfabbe6:packages/frontend/src/utility/$file > /tmp/calls-battery-pr-baseline/$file
done
git show 397246f73ce938fb9655789fe33beed3fdfabbe6:packages/frontend/src/ui/_common_/CallsDock.vue > /tmp/calls-battery-pr-baseline/CallsDock.vue
git show 397246f73ce938fb9655789fe33beed3fdfabbe6:packages/frontend/src/composables/use-calls-room.ts > /tmp/calls-battery-pr-baseline/use-calls-room.ts

# 上記リンクから取得した test.wav を同じ条件へ変換
ffmpeg -stream_loop -1 -i /tmp/test.wav -t 30 -ar 48000 -ac 1 -c:a pcm_s16le /tmp/calls-speaking-input.wav

node packages/frontend/scripts/benchmark-calls-battery.mjs \
  --baseline-dir=/tmp/calls-battery-pr-baseline --runs=3 --duration=15 --warmup=4 --control=2
node packages/frontend/scripts/benchmark-calls-battery.mjs \
  --scenario=speaking --microphone-wav=/tmp/calls-speaking-input.wav \
  --baseline-dir=/tmp/calls-battery-pr-baseline --runs=3 --duration=15 --warmup=4 --control=2
node packages/frontend/scripts/benchmark-calls-battery.mjs \
  --scenario=speaking-bypass --microphone-wav=/tmp/calls-speaking-input.wav \
  --baseline-dir=/tmp/calls-battery-pr-baseline --runs=3 --duration=15 --warmup=4 --control=2
node packages/frontend/scripts/benchmark-calls-dock.mjs \
  --baseline-file=/tmp/calls-battery-pr-baseline/CallsDock.vue --runs=3 --duration=5
```

Node と frontend の依存関係、Playwright の Chromium が必要。CPU 計測中は他のベンチマーク・ビルド・テストを同時に動かさない。今回は既存のローカル依存を再利用した。リアクティブ更新・ポーリングの比較は一時 Vitest fixture で測定し、fixture を削除した。変更後の挙動は恒久の `use-calls-room.test.ts` と `calls-media-controller.test.ts` で確認できる。

検証結果:

- **PASS**: Calls の unit test 全13ファイル・168テスト。依存の実体を置いた元 workspace への読み取りを許可する一時 Vitest config を使い、測定後に削除した。
- **PASS**: ミュート・発話NSオン・発話NSオフの音声比較（各3回）、描画比較（各3回）、ポーリング・リアクティブ更新の比較。
- **PASS**: 変更対象4ソースの lint、SPDX、locale safety、`git diff --check`、ベンチマーク2スクリプトの `node --check`。
- **BASELINE**: `pnpm --filter frontend typecheck` は198件の既存エラーで失敗。同じローカル依存で変更前も同じ198件が出ることを確認し、新規エラーはなかった。主に i18n の `Tsx` 型と既存 `calls-session` のイベント型に関するもの。
- **SKIPPED**: スマホ実機・実SFU・Misskey全画面の消費電力測定。実機の半減判定に使える結果はまだない。

この測定はミュート中の無駄な処理と表示の再描画を減らせたことを示す。発話・NSオンの音声 CPU と実機の消費電力半減は未達または未確認として残す。
