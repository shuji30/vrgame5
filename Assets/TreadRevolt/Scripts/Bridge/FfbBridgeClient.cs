using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace TreadRevolt.Bridge
{
    public enum BridgeState
    {
        Disconnected,
        Connecting,
        Connected,
    }

    /// <summary>
    /// vrgame2 の ffb-bridge に WebSocket で接続し、ハンコンの生の入力を受け取り、FFB の指示を送る。
    /// 割り当て・キャリブレーション・力の合成はここでは行わない(入力変換層の仕事)。
    /// </summary>
    public class FfbBridgeClient : MonoBehaviour
    {
        [Header("接続")]
        [Tooltip("ffb-bridge の待ち受けアドレス(127.0.0.1 のみ)")]
        [SerializeField] string url = "ws://127.0.0.1:18765";

        [Tooltip("送る Origin。ffb-bridge の origins.txt に同じ値を 1 行追加しておく")]
        [SerializeField] string origin = "app://vrgame5";

        [Tooltip("接続後に入力の受信を始める")]
        [SerializeField] bool subscribeInput = true;

        [Tooltip("切断時に再接続を試みる間隔(秒)")]
        [SerializeField] float reconnectInterval = 2f;

        [Header("FFB")]
        [Tooltip("FFB の指示を送る頻度。ブリッジは 0.25 秒指示がないと力を 0 にする")]
        [SerializeField, Range(10f, 120f)] float ffbSendRate = 60f;

        public BridgeState State { get; private set; } = BridgeState.Disconnected;
        public string LastError { get; private set; } = "";
        public BridgeStatus Status { get; private set; }
        public PadState[] Pads { get; private set; } = Array.Empty<PadState>();
        /// <summary>直近 1 秒に受け取った input メッセージの数</summary>
        public float InputRate { get; private set; }
        public bool FfbActive => ffbActive;
        public FfbCommand CurrentFfb => ffb;
        public string Url => url;
        public string Origin => origin;

        public event Action<PadState[]> InputReceived;
        public event Action<BridgeStatus> StatusReceived;

        readonly ConcurrentQueue<string> outbox = new ConcurrentQueue<string>();
        readonly SemaphoreSlim outboxSignal = new SemaphoreSlim(0);

        CancellationTokenSource lifetime;
        ClientWebSocket socket;
        float nextReconnect;

        readonly FfbCommand ffb = new FfbCommand();
        bool ffbActive;
        float nextFfbSend;

        int inputCount;
        float rateTimer;

        void OnEnable()
        {
            lifetime = new CancellationTokenSource();
            nextReconnect = 0f;
        }

        void OnDisable()
        {
            // 終了時はまず力を抜く(ブリッジ側のウォッチドッグでも 0.25 秒で 0 になる)
            if (State == BridgeState.Connected)
            {
                TrySendNow(JsonUtility.ToJson(new StopMessage()));
            }
            ffbActive = false;
            lifetime?.Cancel();
            socket?.Abort();
            socket?.Dispose();
            socket = null;
            State = BridgeState.Disconnected;
            Pads = Array.Empty<PadState>();
        }

        void Update()
        {
            float now = Time.unscaledTime;

            if (State == BridgeState.Disconnected && now >= nextReconnect)
            {
                nextReconnect = now + reconnectInterval;
                _ = ConnectAsync();
            }

            if (State == BridgeState.Connected && ffbActive && now >= nextFfbSend)
            {
                nextFfbSend = now + 1f / ffbSendRate;
                Enqueue(JsonUtility.ToJson(ffb));
            }

            rateTimer += Time.unscaledDeltaTime;
            if (rateTimer >= 1f)
            {
                InputRate = inputCount / rateTimer;
                inputCount = 0;
                rateTimer = 0f;
            }
        }

        // ---------- 公開 API ----------

        /// <summary>FFB の力を設定する。以後 ffbSendRate で送り続ける</summary>
        public void SetFfb(float constant, float damper, float spring, float rumble, int rumbleHz)
        {
            ffb.c = Mathf.Clamp(constant, -1f, 1f);
            ffb.d = Mathf.Clamp01(damper);
            ffb.s = Mathf.Clamp01(spring);
            ffb.r = Mathf.Clamp01(rumble);
            ffb.hz = Mathf.Clamp(rumbleHz, 0, 200);
            ffbActive = true;
        }

        /// <summary>FFB の送信をやめ、力をすぐに 0 にする</summary>
        public void StopFfb()
        {
            ffbActive = false;
            if (State == BridgeState.Connected)
            {
                Enqueue(JsonUtility.ToJson(new StopMessage()));
            }
        }

        /// <summary>ブリッジ内蔵の 1 秒テスト(left / right / rumble / center)</summary>
        public void SendTest(string effect, float gain)
        {
            if (State != BridgeState.Connected) return;
            Enqueue(JsonUtility.ToJson(new TestMessage { effect = effect, gain = Mathf.Clamp01(gain) }));
        }

        /// <summary>デバイスを探し直す(USB 機器を後から挿したとき)</summary>
        public void Rescan()
        {
            if (State != BridgeState.Connected) return;
            Enqueue(JsonUtility.ToJson(new HelloMessage { t = "scan", input = subscribeInput }));
        }

        // ---------- 接続 ----------

        async Task ConnectAsync()
        {
            State = BridgeState.Connecting;
            var ws = new ClientWebSocket();
            try
            {
                // ブリッジは許可した Origin からの接続だけを受け付ける
                ws.Options.SetRequestHeader("Origin", origin);
            }
            catch (Exception e)
            {
                LastError = "Origin ヘッダーを設定できませんでした: " + e.Message;
            }

            try
            {
                await ws.ConnectAsync(new Uri(url), lifetime.Token);
            }
            catch (Exception e)
            {
                ws.Dispose();
                if (!lifetime.IsCancellationRequested)
                {
                    LastError = DescribeConnectError(e);
                    State = BridgeState.Disconnected;
                }
                return;
            }

            if (lifetime.IsCancellationRequested)
            {
                ws.Dispose();
                return;
            }

            socket = ws;
            LastError = "";
            State = BridgeState.Connected;
            Debug.Log($"[ffb-bridge] 接続しました: {url}(Origin: {origin})");

            // 古い送信待ちは捨てる
            while (outbox.TryDequeue(out _)) { }
            Enqueue(JsonUtility.ToJson(new HelloMessage { input = subscribeInput }));

            using (var connection = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
            {
                Task sending = SendLoop(ws, connection.Token);
                await ReceiveLoop(ws, connection.Token);
                connection.Cancel();
                try { await sending; } catch (OperationCanceledException) { }
            }

            if (socket == ws)
            {
                socket = null;
                ws.Dispose();
                State = BridgeState.Disconnected;
                Pads = Array.Empty<PadState>();
                nextReconnect = Time.unscaledTime + reconnectInterval;
                Debug.Log("[ffb-bridge] 切断しました");
            }
        }

        static string DescribeConnectError(Exception e)
        {
            string msg = e.InnerException != null ? e.InnerException.Message : e.Message;
            if (msg.Contains("403"))
            {
                return "接続を拒否されました(403)。ffb-bridge の origins.txt に Origin を追加してください: " + msg;
            }
            if (msg.Contains("refused") || msg.Contains("拒否") || msg.Contains("Unable to connect"))
            {
                return "ffb-bridge が起動していないようです(start.bat を起動してください): " + msg;
            }
            return msg;
        }

        async Task ReceiveLoop(ClientWebSocket ws, CancellationToken token)
        {
            var buffer = new byte[16 * 1024];
            var message = new MemoryStream();
            try
            {
                while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
                {
                    WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }
                    message.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage) continue;

                    string text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                    message.SetLength(0);
                    Handle(text);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e)
            {
                if (!token.IsCancellationRequested)
                {
                    LastError = "受信エラー: " + e.Message;
                }
            }
        }

        async Task SendLoop(ClientWebSocket ws, CancellationToken token)
        {
            // ClientWebSocket は同時に 1 つしか送れないので、1 本のループで順に送る
            while (!token.IsCancellationRequested)
            {
                await outboxSignal.WaitAsync(token);
                if (!outbox.TryDequeue(out string text)) continue;
                if (ws.State != WebSocketState.Open) break;
                byte[] bytes = Encoding.UTF8.GetBytes(text);
                try
                {
                    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception e)
                {
                    LastError = "送信エラー: " + e.Message;
                    break;
                }
            }
        }

        void Enqueue(string text)
        {
            outbox.Enqueue(text);
            outboxSignal.Release();
        }

        void TrySendNow(string text)
        {
            // 終了時用。送れなくても気にしない(ウォッチドッグで力は抜ける)
            try
            {
                if (socket != null && socket.State == WebSocketState.Open)
                {
                    byte[] bytes = Encoding.UTF8.GetBytes(text);
                    socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)
                        .Wait(100);
                }
            }
            catch (Exception) { }
        }

        void Handle(string text)
        {
            BridgeMessageHead head;
            try
            {
                head = JsonUtility.FromJson<BridgeMessageHead>(text);
            }
            catch (Exception)
            {
                return;
            }
            if (head == null) return;

            switch (head.t)
            {
                case "input":
                {
                    var input = JsonUtility.FromJson<BridgeInput>(text);
                    Pads = input.pads ?? Array.Empty<PadState>();
                    inputCount++;
                    InputReceived?.Invoke(Pads);
                    break;
                }
                case "status":
                {
                    Status = JsonUtility.FromJson<BridgeStatus>(text);
                    StatusReceived?.Invoke(Status);
                    break;
                }
            }
        }
    }
}
