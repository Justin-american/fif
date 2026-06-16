using FIF.Core;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.Match
{
    /// <summary>
    /// Placeholder Match scene controller (BUILD ORDER step 1 uses a placeholder
    /// match scene). It reads the state carried by the GameManager — selected
    /// teams, GameMode and settings — and displays it, proving the menu→match
    /// state architecture works end to end. The real gameplay systems
    /// (ball physics, players, AI, set pieces) replace this in later build steps.
    /// </summary>
    public class MatchBootstrap : MonoBehaviour
    {
        [Header("Readout (placeholder)")]
        [SerializeField] private Text headerText;
        [SerializeField] private Text detailText;
        [SerializeField] private Button backButton;

        private void Awake()
        {
            if (backButton != null)
                backButton.onClick.AddListener(BackToMenu);
        }

        private void Start()
        {
            var gm = GameManager.EnsureExists();
            var s = gm.Settings;

            string header;
            string detail;

            if (gm.gameMode == GameMode.FullMatch)
            {
                string user = gm.userTeam != null ? gm.userTeam.teamName : "—";
                string opp = gm.opponentTeam != null ? gm.opponentTeam.teamName : "—";
                header = $"{user}  vs  {opp}";
                detail =
                    $"Mode: Full Match\n" +
                    $"Half length: {s.matchLengthMinutes} min\n" +
                    $"Difficulty: {s.difficulty}\n" +
                    $"Pass assist: {s.passAssistance}\n" +
                    $"Camera: {s.cameraStyle}";
            }
            else
            {
                string user = gm.userTeam != null ? gm.userTeam.teamName : "—";
                header = ModeTitle(gm.gameMode);
                detail =
                    $"Your team: {user}\n" +
                    $"Difficulty: {s.difficulty}\n" +
                    DescribePractice(gm.gameMode);
            }

            if (headerText != null) headerText.text = header;
            if (detailText != null) detailText.text = detail;
        }

        private static string ModeTitle(GameMode mode)
        {
            switch (mode)
            {
                case GameMode.PracticeAttack: return "Practice: Attacking";
                case GameMode.PracticePenalty: return "Practice: Penalties";
                case GameMode.PracticeFreeKick: return "Practice: Free Kicks";
                default: return "Match";
            }
        }

        private static string DescribePractice(GameMode mode)
        {
            switch (mode)
            {
                case GameMode.PracticeAttack:
                    return "Setup: opposing GOALKEEPER ONLY — no outfield defenders. Ball resets near you after a goal or when out of play.";
                case GameMode.PracticePenalty:
                    return "Setup: repeated penalties vs. a diving keeper. Tracks scored/missed.";
                case GameMode.PracticeFreeKick:
                    return "Setup: repeated direct free kicks vs. wall + keeper. Cycle spawn positions.";
                default:
                    return string.Empty;
            }
        }

        private void BackToMenu()
        {
            if (SceneLoader.Instance != null)
                SceneLoader.Instance.Load(SceneLoader.MainMenu);
        }
    }
}
