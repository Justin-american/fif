using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace FIF.Core
{
    /// <summary>
    /// Handles scene transitions with a simple fade-to-black so navigation
    /// between MainMenu, TeamSelect and Match feels clean (PART A5).
    /// Attach to a persistent object with a full-screen CanvasGroup overlay.
    /// </summary>
    public class SceneLoader : MonoBehaviour
    {
        public static SceneLoader Instance { get; private set; }

        // Canonical scene names. Keep in sync with the Build Settings list.
        public const string MainMenu = "MainMenu";
        public const string TeamSelect = "TeamSelect";
        public const string Match = "Match";

        [Header("Fade")]
        [Tooltip("Full-screen overlay used for the fade. Optional; if null we skip the fade.")]
        [SerializeField] private CanvasGroup fadeOverlay;
        [SerializeField] private float fadeDuration = 0.35f;

        private bool _isLoading;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            if (fadeOverlay != null)
            {
                fadeOverlay.alpha = 0f;
                fadeOverlay.blocksRaycasts = false;
            }
        }

        /// <summary>Loads a scene by name with a fade in/out.</summary>
        public void Load(string sceneName)
        {
            if (_isLoading) return;
            StartCoroutine(LoadRoutine(sceneName));
        }

        private IEnumerator LoadRoutine(string sceneName)
        {
            _isLoading = true;

            yield return Fade(1f);

            var op = SceneManager.LoadSceneAsync(sceneName);
            while (op != null && !op.isDone)
                yield return null;

            yield return Fade(0f);

            _isLoading = false;
        }

        private IEnumerator Fade(float target)
        {
            if (fadeOverlay == null)
                yield break;

            fadeOverlay.blocksRaycasts = true;
            float start = fadeOverlay.alpha;
            float t = 0f;
            while (t < fadeDuration)
            {
                t += Time.unscaledDeltaTime;
                fadeOverlay.alpha = Mathf.Lerp(start, target, t / fadeDuration);
                yield return null;
            }
            fadeOverlay.alpha = target;
            fadeOverlay.blocksRaycasts = target > 0.99f;
        }
    }
}
