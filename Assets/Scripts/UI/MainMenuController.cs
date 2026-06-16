using FIF.Core;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.UI
{
    /// <summary>
    /// Main Menu (PART A1). This is the FIRST screen on launch — the player is
    /// never thrown directly into a match. Offers Start Game, Practice and
    /// Settings. Practice and Settings are shown as in-scene panels so the menu
    /// flow stays snappy; Start Game transitions to the Team Select scene.
    /// </summary>
    public class MainMenuController : MonoBehaviour
    {
        [Header("Root Panels")]
        [SerializeField] private GameObject mainPanel;
        [SerializeField] private PracticeMenuController practicePanel;
        [SerializeField] private SettingsController settingsPanel;

        [Header("Main Buttons")]
        [SerializeField] private Button startButton;
        [SerializeField] private Button practiceButton;
        [SerializeField] private Button settingsButton;

        private void Awake()
        {
            // Make sure the persistent singletons exist regardless of which
            // scene play begins from.
            GameManager.EnsureExists();

            if (startButton != null) startButton.onClick.AddListener(OnStartGame);
            if (practiceButton != null) practiceButton.onClick.AddListener(OpenPractice);
            if (settingsButton != null) settingsButton.onClick.AddListener(OpenSettings);
        }

        private void Start()
        {
            ShowMain();
        }

        public void ShowMain()
        {
            if (mainPanel != null) mainPanel.SetActive(true);
            if (practicePanel != null) practicePanel.gameObject.SetActive(false);
            if (settingsPanel != null) settingsPanel.gameObject.SetActive(false);
        }

        private void OnStartGame()
        {
            if (SceneLoader.Instance != null)
                SceneLoader.Instance.Load(SceneLoader.TeamSelect);
        }

        private void OpenPractice()
        {
            if (mainPanel != null) mainPanel.SetActive(false);
            if (practicePanel != null)
            {
                practicePanel.gameObject.SetActive(true);
                practicePanel.Init(this);
            }
        }

        private void OpenSettings()
        {
            if (mainPanel != null) mainPanel.SetActive(false);
            if (settingsPanel != null)
            {
                settingsPanel.gameObject.SetActive(true);
                settingsPanel.Init(this);
            }
        }
    }
}
