using FIF.Data;
using UnityEngine;

namespace FIF.Core
{
    /// <summary>
    /// Persistent singleton (DontDestroyOnLoad) that carries state between
    /// scenes (PART A5): the user's selected teams, the chosen GameMode and the
    /// user settings. The Match scene reads from here on load so the menus never
    /// have to hand data over directly.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Carried Match Selection")]
        public TeamData userTeam;
        public TeamData opponentTeam;
        public GameMode gameMode = GameMode.FullMatch;

        /// <summary>Live settings, loaded from PlayerPrefs on first boot.</summary>
        public GameSettings Settings { get; private set; }

        private void Awake()
        {
            // Enforce a single instance that survives scene loads.
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            Settings = GameSettings.Load();
        }

        /// <summary>
        /// Guarantees a GameManager exists even if play starts from a scene that
        /// does not contain one (useful when testing scenes in isolation).
        /// </summary>
        public static GameManager EnsureExists()
        {
            if (Instance == null)
            {
                var go = new GameObject("GameManager");
                go.AddComponent<GameManager>();
            }
            return Instance;
        }

        /// <summary>Stores the full-match selection made on the Team Select screen.</summary>
        public void SetMatchup(TeamData user, TeamData opponent)
        {
            userTeam = user;
            opponentTeam = opponent;
            gameMode = GameMode.FullMatch;
        }

        /// <summary>Configures a practice session. Opponent may be null for drills.</summary>
        public void SetPractice(GameMode mode, TeamData user = null)
        {
            gameMode = mode;
            userTeam = user != null ? user : userTeam;
            opponentTeam = null;
        }

        /// <summary>Re-applies persisted settings (e.g. after the Settings screen saves).</summary>
        public void ReloadSettings() => Settings = GameSettings.Load();
    }
}
