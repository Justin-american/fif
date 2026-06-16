using System.Text;
using FIF.Core;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.Match
{
    /// <summary>
    /// Match scene controller. It reads the state carried by the GameManager —
    /// selected teams, GameMode and settings — and now also runs the headless
    /// <see cref="MatchEngine"/> (Parts C &amp; D) to produce a real scoreline and
    /// commentary, proving the menu→data→simulation pipeline works end to end.
    /// The live, on-pitch visual representation of the simulation is the next
    /// build step; this scene drives and reports the engine.
    /// </summary>
    public class MatchBootstrap : MonoBehaviour
    {
        [Header("Readout")]
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

                var result = SimulateIfPossible(gm);
                detail =
                    $"Mode: Full Match\n" +
                    $"Half length: {s.matchLengthMinutes} min\n" +
                    $"Difficulty: {s.difficulty}\n" +
                    $"Pass assist: {s.passAssistance}\n" +
                    $"Camera: {s.cameraStyle}\n" +
                    result;
            }
            else
            {
                string user = gm.userTeam != null ? gm.userTeam.teamName : "—";
                header = ModeTitle(gm.gameMode);
                detail =
                    $"Your team: {user}\n" +
                    $"Difficulty: {s.difficulty}\n" +
                    DescribePractice(gm.gameMode) + "\n" +
                    SimulateIfPossible(gm);
            }

            if (headerText != null) headerText.text = header;
            if (detailText != null) detailText.text = detail;
        }

        /// <summary>
        /// Runs the deterministic match engine for the carried matchup and returns
        /// a short result summary. Requires at least the user's team; for full
        /// matches an opponent is needed too.
        /// </summary>
        private string SimulateIfPossible(GameManager gm)
        {
            if (gm.userTeam == null)
                return "\n(No team selected — nothing to simulate.)";
            if (gm.gameMode == GameMode.FullMatch && gm.opponentTeam == null)
                return "\n(No opponent selected — nothing to simulate.)";

            var cfg = MatchConfig.FromSettings(gm.Settings);
            var engine = new MatchEngine(gm.userTeam, gm.opponentTeam, gm.gameMode, cfg);
            engine.SimulateToEnd();

            var sb = new StringBuilder();
            sb.Append('\n');
            if (gm.gameMode == GameMode.FullMatch)
                sb.AppendLine($"Result: {engine.HomeScore}-{engine.AwayScore}");
            else
                sb.AppendLine($"Drill: {engine.DrillGoals}/{engine.DrillAttempts} scored");

            int from = Mathf.Max(0, engine.EventLog.Count - 6);
            for (int i = from; i < engine.EventLog.Count; i++)
                sb.AppendLine(engine.EventLog[i]);
            return sb.ToString();
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
