using TreadRevolt.Bridge;
using UnityEditor;
using UnityEngine;

namespace TreadRevolt.EditorTools
{
    /// <summary>メニュー「TreadRevolt > ffb-bridge 接続テストを配置」で、テスト用の GameObject を今のシーンに置く</summary>
    public static class FfbBridgeTestMenu
    {
        [MenuItem("TreadRevolt/ffb-bridge 接続テストを配置")]
        static void Place()
        {
            var existing = Object.FindFirstObjectByType<FfbBridgeClient>();
            if (existing != null)
            {
                Selection.activeGameObject = existing.gameObject;
                EditorGUIUtility.PingObject(existing.gameObject);
                Debug.Log("[ffb-bridge] このシーンにはすでに FfbBridgeClient があります");
                return;
            }

            var go = new GameObject("FfbBridge");
            go.AddComponent<FfbBridgeClient>();
            go.AddComponent<FfbBridgeTestHud>();
            Undo.RegisterCreatedObjectUndo(go, "ffb-bridge 接続テストを配置");
            Selection.activeGameObject = go;
            Debug.Log("[ffb-bridge] FfbBridge を配置しました。Play を押して接続を確かめてください");
        }
    }
}
