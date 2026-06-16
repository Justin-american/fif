using FIF.Core;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.UI
{
    /// <summary>
    /// Settings screen (PART A4). Edits a working copy of GameSettings and only
    /// commits to PlayerPrefs when Apply is pressed. Supports match length,
    /// difficulty, pass assistance, audio sliders, camera style and a controls
    /// reference panel.
    /// </summary>
    public class SettingsController : MonoBehaviour
    {
        [Header("Gameplay")]
        [Tooltip("Dropdown options should map to 3 / 5 / 7 / 10 minute halves.")]
        [SerializeField] private Dropdown matchLengthDropdown;
        [SerializeField] private Dropdown difficultyDropdown;
        [SerializeField] private Dropdown passAssistDropdown;

        [Header("Audio")]
        [SerializeField] private Slider masterSlider;
        [SerializeField] private Slider sfxSlider;
        [SerializeField] private Slider musicSlider;

        [Header("Presentation")]
        [SerializeField] private Dropdown cameraDropdown;

        [Header("Controls Panel")]
        [SerializeField] private GameObject controlsPanel;
        [SerializeField] private Button controlsButton;
        [SerializeField] private Button controlsCloseButton;

        [Header("Footer")]
        [SerializeField] private Button applyButton;
        [SerializeField] private Button backButton;

        // The match-length dropdown maps index -> minutes.
        private static readonly int[] MatchLengths = { 3, 5, 7, 10 };

        private MainMenuController _owner;
        private GameSettings _working;

        private void Awake()
        {
            if (applyButton != null) applyButton.onClick.AddListener(Apply);
            if (backButton != null) backButton.onClick.AddListener(Back);
            if (controlsButton != null) controlsButton.onClick.AddListener(() => ToggleControls(true));
            if (controlsCloseButton != null) controlsCloseButton.onClick.AddListener(() => ToggleControls(false));
        }

        /// <summary>Called by the Main Menu when this panel is opened.</summary>
        public void Init(MainMenuController owner)
        {
            _owner = owner;
            _working = GameSettings.Load();
            PopulateFromWorking();
            ToggleControls(false);
        }

        private void PopulateFromWorking()
        {
            if (matchLengthDropdown != null)
                matchLengthDropdown.value = Mathf.Max(0, System.Array.IndexOf(MatchLengths, _working.matchLengthMinutes));
            if (difficultyDropdown != null)
                difficultyDropdown.value = (int)_working.difficulty;
            if (passAssistDropdown != null)
                passAssistDropdown.value = (int)_working.passAssistance;
            if (cameraDropdown != null)
                cameraDropdown.value = (int)_working.cameraStyle;

            if (masterSlider != null) masterSlider.value = _working.masterVolume;
            if (sfxSlider != null) sfxSlider.value = _working.sfxVolume;
            if (musicSlider != null) musicSlider.value = _working.musicVolume;
        }

        private void ReadIntoWorking()
        {
            if (matchLengthDropdown != null)
            {
                int idx = Mathf.Clamp(matchLengthDropdown.value, 0, MatchLengths.Length - 1);
                _working.matchLengthMinutes = MatchLengths[idx];
            }
            if (difficultyDropdown != null) _working.difficulty = (Difficulty)difficultyDropdown.value;
            if (passAssistDropdown != null) _working.passAssistance = (PassAssistance)passAssistDropdown.value;
            if (cameraDropdown != null) _working.cameraStyle = (CameraStyle)cameraDropdown.value;

            if (masterSlider != null) _working.masterVolume = masterSlider.value;
            if (sfxSlider != null) _working.sfxVolume = sfxSlider.value;
            if (musicSlider != null) _working.musicVolume = musicSlider.value;
        }

        private void Apply()
        {
            ReadIntoWorking();
            _working.Save();
            if (GameManager.Instance != null) GameManager.Instance.ReloadSettings();
        }

        private void Back()
        {
            if (_owner != null) _owner.ShowMain();
        }

        private void ToggleControls(bool show)
        {
            if (controlsPanel != null) controlsPanel.SetActive(show);
        }
    }
}
