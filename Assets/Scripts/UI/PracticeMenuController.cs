using FIF.Core;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.UI
{
    /// <summary>
    /// Practice submenu (PART A3). Offers the three drills. Each sets the
    /// GameMode on the GameManager and loads the Match scene, which configures
    /// itself from that mode (Practice Attacking spawns only the opposing GK).
    /// </summary>
    public class PracticeMenuController : MonoBehaviour
    {
        [Header("Buttons")]
        [SerializeField] private Button attackButton;
        [SerializeField] private Button penaltyButton;
        [SerializeField] private Button freeKickButton;
        [SerializeField] private Button backButton;

        private MainMenuController _owner;

        private void Awake()
        {
            if (attackButton != null) attackButton.onClick.AddListener(() => StartPractice(GameMode.PracticeAttack));
            if (penaltyButton != null) penaltyButton.onClick.AddListener(() => StartPractice(GameMode.PracticePenalty));
            if (freeKickButton != null) freeKickButton.onClick.AddListener(() => StartPractice(GameMode.PracticeFreeKick));
            if (backButton != null) backButton.onClick.AddListener(BackToMain);
        }

        /// <summary>Called by the Main Menu when this panel is opened.</summary>
        public void Init(MainMenuController owner) => _owner = owner;

        private void StartPractice(GameMode mode)
        {
            var gm = GameManager.EnsureExists();
            // Default the user's team to the first available squad so practice
            // kits/keepers are populated even without a Team Select pass.
            var teams = TeamDatabase.GetTeams();
            var userTeam = gm.userTeam != null ? gm.userTeam : (teams.Count > 0 ? teams[0] : null);
            gm.SetPractice(mode, userTeam);

            if (SceneLoader.Instance != null)
                SceneLoader.Instance.Load(SceneLoader.Match);
        }

        private void BackToMain()
        {
            if (_owner != null) _owner.ShowMain();
        }
    }
}
