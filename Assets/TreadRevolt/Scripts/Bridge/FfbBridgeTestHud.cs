using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace TreadRevolt.Bridge
{
    /// <summary>
    /// フェーズ0 の作業1「ffb-bridge 接続テスト」用の画面表示(PC のゲームビューに出す。VR では見えない)。
    /// 確かめること:1. 接続できる 2. 入力が届く 3. 値が表示される 4. FFB の力が出る
    /// </summary>
    [RequireComponent(typeof(FfbBridgeClient))]
    public class FfbBridgeTestHud : MonoBehaviour
    {
        [Tooltip("表示の拡大率(高解像度の画面向け)")]
        [SerializeField] float uiScale = 1.5f;

        [Tooltip("値が変わった軸・ボタンを強調表示する時間(秒)。割り当てを調べるときに使う")]
        [SerializeField] float highlightSeconds = 0.6f;

        FfbBridgeClient client;
        Vector2 scroll;

        // FFB のテスト値
        float constant, damper, spring, rumble;
        float rumbleHz = 25f;
        bool sendFfb;
        float testGain = 0.5f;

        // 変化した軸・ボタンの記録(機器名+番号 → 最後に変化した時刻)
        readonly Dictionary<string, float[]> lastAxes = new Dictionary<string, float[]>();
        readonly Dictionary<string, int[]> lastButtons = new Dictionary<string, int[]>();
        readonly Dictionary<string, float> changedAt = new Dictionary<string, float>();

        GUIStyle mono, hot, head;

        void Awake()
        {
            client = GetComponent<FfbBridgeClient>();
        }

        void OnEnable()
        {
            client.InputReceived += TrackChanges;
        }

        void OnDisable()
        {
            client.InputReceived -= TrackChanges;
            if (sendFfb) client.StopFfb();
            sendFfb = false;
        }

        void Update()
        {
            if (sendFfb)
            {
                client.SetFfb(constant, damper, spring, rumble, Mathf.RoundToInt(rumbleHz));
            }
        }

        void TrackChanges(PadState[] pads)
        {
            float now = Time.unscaledTime;
            foreach (var pad in pads)
            {
                string key = pad.id + "#" + pad.index;
                if (lastAxes.TryGetValue(key, out var prevAxes) && pad.axes != null)
                {
                    for (int i = 0; i < pad.axes.Length && i < prevAxes.Length; i++)
                    {
                        if (Mathf.Abs(pad.axes[i] - prevAxes[i]) > 0.02f) changedAt[key + "/a" + i] = now;
                    }
                }
                if (lastButtons.TryGetValue(key, out var prevButtons) && pad.buttons != null)
                {
                    for (int i = 0; i < pad.buttons.Length && i < prevButtons.Length; i++)
                    {
                        if (pad.buttons[i] != prevButtons[i]) changedAt[key + "/b" + i] = now;
                    }
                }
                lastAxes[key] = pad.axes != null ? (float[])pad.axes.Clone() : new float[0];
                lastButtons[key] = pad.buttons != null ? (int[])pad.buttons.Clone() : new int[0];
            }
        }

        bool Recently(string key)
        {
            return changedAt.TryGetValue(key, out float t) && Time.unscaledTime - t < highlightSeconds;
        }

        void EnsureStyles()
        {
            if (mono != null) return;
            mono = new GUIStyle(GUI.skin.label) { richText = true, wordWrap = false };
            hot = new GUIStyle(mono);
            hot.normal.textColor = new Color(1f, 0.8f, 0.2f);
            head = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, richText = true };
        }

        void OnGUI()
        {
            EnsureStyles();
            GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1f));
            float w = Screen.width / uiScale, h = Screen.height / uiScale;

            GUILayout.BeginArea(new Rect(10, 10, w - 20, h - 20));
            scroll = GUILayout.BeginScrollView(scroll);

            DrawConnection();
            GUILayout.Space(8);
            DrawDevices();
            GUILayout.Space(8);
            DrawFfb();
            GUILayout.Space(8);
            DrawPads();

            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        void DrawConnection()
        {
            GUILayout.Label("ffb-bridge 接続テスト", head);
            string color = client.State == BridgeState.Connected ? "#7f7" : client.State == BridgeState.Connecting ? "#ff7" : "#f77";
            GUILayout.Label($"1. 接続:<color={color}>{client.State}</color>   {client.Url}   Origin: {client.Origin}", mono);
            if (!string.IsNullOrEmpty(client.LastError))
            {
                GUILayout.Label("<color=#f77>" + client.LastError + "</color>", mono);
            }
            GUILayout.Label($"2. 入力の受信:{client.InputRate:0} 回/秒(変化がなければ 2 回/秒、操作中は最大 125 回/秒)", mono);
        }

        void DrawDevices()
        {
            GUILayout.Label("デバイス", head);
            var st = client.Status;
            if (st == null || st.devices == null || st.devices.Length == 0)
            {
                GUILayout.Label("(まだ情報がない、またはデバイスが見つからない)", mono);
            }
            else
            {
                foreach (var d in st.devices)
                {
                    string ffbMark = d.haptic ? " [FFB対応]" : "";
                    string sel = st.selected == d.name ? " ← FFB に使用中" : "";
                    GUILayout.Label($"  #{d.index} {d.name}{ffbMark}{sel}", mono);
                }
                if (!string.IsNullOrEmpty(st.error))
                {
                    GUILayout.Label("<color=#f77>FFB エラー: " + st.error + "</color>", mono);
                }
            }
            if (GUILayout.Button("デバイスを探し直す", GUILayout.Width(200)))
            {
                client.Rescan();
            }
        }

        void DrawFfb()
        {
            GUILayout.Label("4. FFB のテスト", head);

            GUILayout.BeginHorizontal();
            GUILayout.Label("ブリッジ内蔵テスト(1 秒):", mono, GUILayout.Width(200));
            testGain = GUILayout.HorizontalSlider(testGain, 0f, 1f, GUILayout.Width(120));
            GUILayout.Label($"{testGain:0.00}", mono, GUILayout.Width(40));
            if (GUILayout.Button("左")) client.SendTest("left", testGain);
            if (GUILayout.Button("右")) client.SendTest("right", testGain);
            if (GUILayout.Button("振動")) client.SendTest("rumble", testGain);
            if (GUILayout.Button("センター")) client.SendTest("center", testGain);
            GUILayout.EndHorizontal();

            constant = Slider("constant(-1〜1)", constant, -1f, 1f);
            damper = Slider("damper(0〜1)", damper, 0f, 1f);
            spring = Slider("spring(0〜1)", spring, 0f, 1f);
            rumble = Slider("振動の強さ(0〜1)", rumble, 0f, 1f);
            rumbleHz = Slider("振動の周波数(0〜200)", rumbleHz, 0f, 200f);

            GUILayout.BeginHorizontal();
            bool next = GUILayout.Toggle(sendFfb, sendFfb ? " ゲームから送信中(60回/秒)" : " ゲームから送信する");
            if (next != sendFfb)
            {
                sendFfb = next;
                if (!sendFfb) client.StopFfb();
            }
            if (GUILayout.Button("すべて 0 にして止める", GUILayout.Width(200)))
            {
                constant = damper = spring = rumble = 0f;
                sendFfb = false;
                client.StopFfb();
            }
            GUILayout.EndHorizontal();
            GUILayout.Label("最大出力はブリッジ側で頭打ちされる(既定 80%、自動起動時 30%)。最初は弱い値から試すこと。", mono);
        }

        float Slider(string label, float value, float min, float max)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label(label, mono, GUILayout.Width(200));
            value = GUILayout.HorizontalSlider(value, min, max, GUILayout.Width(240));
            GUILayout.Label($"{value:0.00}", mono, GUILayout.Width(50));
            if (GUILayout.Button("0", GUILayout.Width(30))) value = 0f;
            GUILayout.EndHorizontal();
            return value;
        }

        void DrawPads()
        {
            GUILayout.Label("3. 入力の値(動かした軸・ボタンは黄色で光る)", head);
            var pads = client.Pads;
            if (pads == null || pads.Length == 0)
            {
                GUILayout.Label("(入力がない)", mono);
                return;
            }
            var sb = new StringBuilder();
            foreach (var pad in pads)
            {
                string key = pad.id + "#" + pad.index;
                GUILayout.Label($"■ {pad.id}(index {pad.index})", head);

                if (pad.axes != null)
                {
                    for (int i = 0; i < pad.axes.Length; i++)
                    {
                        float v = pad.axes[i];
                        GUILayout.Label($"  軸{i,2}: {v,6:0.000}  {Bar(v)}", Recently(key + "/a" + i) ? hot : mono);
                    }
                }

                if (pad.buttons != null && pad.buttons.Length > 0)
                {
                    sb.Clear();
                    sb.Append("  押されているボタン:");
                    bool any = false;
                    for (int i = 0; i < pad.buttons.Length; i++)
                    {
                        if (pad.buttons[i] != 0) { sb.Append(' ').Append(i); any = true; }
                    }
                    if (!any) sb.Append(" なし");
                    sb.Append($"(全 {pad.buttons.Length} 個。十字キーは末尾の 4 つ)");
                    bool hotButtons = false;
                    for (int i = 0; i < pad.buttons.Length; i++)
                    {
                        if (Recently(key + "/b" + i)) { hotButtons = true; break; }
                    }
                    GUILayout.Label(sb.ToString(), hotButtons ? hot : mono);
                }
            }
        }

        static string Bar(float v)
        {
            // -1〜1 を 21 マスで表す。中央が 0
            const int half = 10;
            int pos = Mathf.RoundToInt(Mathf.Clamp(v, -1f, 1f) * half) + half;
            var sb = new StringBuilder(23);
            sb.Append('[');
            for (int i = 0; i <= half * 2; i++)
            {
                sb.Append(i == pos ? '●' : i == half ? '|' : '-');
            }
            sb.Append(']');
            return sb.ToString();
        }
    }
}
