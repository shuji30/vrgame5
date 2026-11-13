using System;

namespace TreadRevolt.Bridge
{
    // ffb-bridge(vrgame2)とやり取りする JSON の型。
    // JsonUtility で読み書きするので、public フィールドと [Serializable] にしている。
    // ブリッジ側の形式は変えない(下位互換)。ここはブリッジの bridge.py に合わせる。

    /// <summary>種類(t)だけを先に読むための型</summary>
    [Serializable]
    public class BridgeMessageHead
    {
        public string t;
    }

    /// <summary>ブリッジが認識しているデバイス(status の devices の要素)</summary>
    [Serializable]
    public class BridgeDevice
    {
        public int index;
        public string name;
        public bool haptic;
    }

    /// <summary>{"t":"status", devices, selected, error, telemetry}</summary>
    [Serializable]
    public class BridgeStatus
    {
        public string t;
        public BridgeDevice[] devices;
        /// <summary>FFB に使っているデバイス名。なければ null</summary>
        public string selected;
        /// <summary>FFB デバイスのエラー。なければ null</summary>
        public string error;
    }

    /// <summary>1 台のジョイスティックの生の値(input の pads の要素)</summary>
    [Serializable]
    public class PadState
    {
        /// <summary>機器名</summary>
        public string id;
        /// <summary>ブリッジ内の番号(接続し直すと変わることがある)</summary>
        public int index;
        /// <summary>軸の値(-1〜1)</summary>
        public float[] axes;
        /// <summary>ボタン(0/1)。十字キーは末尾に 4 つのボタンとして並ぶ</summary>
        public int[] buttons;
    }

    /// <summary>{"t":"input","pads":[...]}</summary>
    [Serializable]
    public class BridgeInput
    {
        public string t;
        public PadState[] pads;
    }

    /// <summary>{"t":"hello","input":true}。接続直後に送ると入力が届き始める("scan" も同じ扱い)</summary>
    [Serializable]
    public class HelloMessage
    {
        public string t = "hello";
        public bool input = true;
    }

    /// <summary>{"t":"ffb", c, d, s, r, hz}。0.25 秒送らないとブリッジ側で力が 0 になる</summary>
    [Serializable]
    public class FfbCommand
    {
        public string t = "ffb";
        /// <summary>constant(-1〜1)</summary>
        public float c;
        /// <summary>damper(0〜1)</summary>
        public float d;
        /// <summary>spring(0〜1)。中央へ戻す力</summary>
        public float s;
        /// <summary>振動の強さ(0〜1)</summary>
        public float r;
        /// <summary>振動の周波数(0〜200)</summary>
        public int hz;
    }

    /// <summary>{"t":"test","effect":"left|right|rumble|center","gain":0〜1}。ブリッジ内蔵の 1 秒テスト</summary>
    [Serializable]
    public class TestMessage
    {
        public string t = "test";
        public string effect;
        public float gain = 0.5f;
    }

    /// <summary>{"t":"stop"}。FFB をすぐに 0 にする</summary>
    [Serializable]
    public class StopMessage
    {
        public string t = "stop";
    }
}
