using System.Collections.Generic;
using System.Text;
using FIF.Core;
using FIF.Data;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.UI
{
    /// <summary>
    /// Team Selection screen (PART A2). Flow:
    ///  1. Pick YOUR team from the grid.
    ///  2. Pick the OPPONENT from the same grid.
    ///  3. The details panel shows the highlighted team's ATK/DEF/MID/OVR,
    ///     name, colour and a starting XI preview.
    ///  4. The central PLAY button starts the match — disabled until both teams
    ///     are chosen. Picking the same team for both sides is allowed.
    /// </summary>
    public class TeamSelectController : MonoBehaviour
    {
        private enum PickTarget { User, Opponent }

        [Header("Grid")]
        [SerializeField] private Transform gridParent;
        [SerializeField] private TeamButton teamButtonPrefab;

        [Header("Authored Teams (optional)")]
        [Tooltip("If empty, the built-in TeamDatabase squads are used.")]
        [SerializeField] private List<TeamData> authoredTeams = new List<TeamData>();

        [Header("Details Panel")]
        [SerializeField] private Text detailsName;
        [SerializeField] private Text detailsStats;   // "ATK 88  DEF 84  MID 89  OVR 88"
        [SerializeField] private Text detailsXI;       // starting XI names
        [SerializeField] private Image detailsColor;

        [Header("Selection Labels")]
        [SerializeField] private Text userTeamLabel;
        [SerializeField] private Text opponentTeamLabel;
        [SerializeField] private Text promptLabel;     // "Pick your team" / "Pick opponent"

        [Header("Footer")]
        [SerializeField] private Button playButton;
        [SerializeField] private Button backButton;

        private readonly List<TeamButton> _buttons = new List<TeamButton>();
        private TeamData _userTeam;
        private TeamData _opponentTeam;
        private PickTarget _pickTarget = PickTarget.User;

        private void Awake()
        {
            GameManager.EnsureExists();
            if (playButton != null) playButton.onClick.AddListener(OnPlay);
            if (backButton != null) backButton.onClick.AddListener(OnBack);
        }

        private void Start()
        {
            BuildGrid();
            _pickTarget = PickTarget.User;
            UpdateUI();
        }

        private void BuildGrid()
        {
            var teams = (authoredTeams != null && authoredTeams.Count > 0)
                ? authoredTeams
                : TeamDatabase.GetTeams();

            if (gridParent == null || teamButtonPrefab == null) return;

            foreach (var team in teams)
            {
                if (team == null) continue;
                var btn = Instantiate(teamButtonPrefab, gridParent);
                btn.Bind(team, this);
                _buttons.Add(btn);
            }
        }

        /// <summary>Called by a TeamButton when clicked.</summary>
        public void OnTeamClicked(TeamButton button)
        {
            ShowDetails(button.Team);

            if (_pickTarget == PickTarget.User)
            {
                _userTeam = button.Team;
                // Advance to opponent selection automatically.
                _pickTarget = PickTarget.Opponent;
            }
            else
            {
                _opponentTeam = button.Team;
            }

            RefreshMarkers();
            UpdateUI();
        }

        private void ShowDetails(TeamData team)
        {
            if (team == null) return;

            if (detailsName != null) detailsName.text = team.teamName;
            if (detailsStats != null)
                detailsStats.text = $"ATK {team.attack}   DEF {team.defense}   MID {team.midfield}   OVR {team.Overall}";
            if (detailsColor != null) detailsColor.color = team.primaryColor;
            if (detailsXI != null) detailsXI.text = BuildXIPreview(team);
        }

        private static string BuildXIPreview(TeamData team)
        {
            var sb = new StringBuilder();
            foreach (var p in team.startingXI)
            {
                if (p == null) continue;
                sb.Append(p.position).Append("  ").Append(p.displayName);
                if (p.isCaptain) sb.Append(" (C)");
                sb.Append('\n');
            }
            return sb.ToString();
        }

        private void RefreshMarkers()
        {
            foreach (var b in _buttons)
                b.SetMarkers(b.Team == _userTeam, b.Team == _opponentTeam);
        }

        private void UpdateUI()
        {
            if (userTeamLabel != null)
                userTeamLabel.text = _userTeam != null ? $"You: {_userTeam.teamName}" : "You: —";
            if (opponentTeamLabel != null)
                opponentTeamLabel.text = _opponentTeam != null ? $"Opponent: {_opponentTeam.teamName}" : "Opponent: —";
            if (promptLabel != null)
                promptLabel.text = _pickTarget == PickTarget.User ? "Pick your team" : "Pick the opponent";

            // PLAY only allowed once both sides are chosen.
            if (playButton != null)
                playButton.interactable = _userTeam != null && _opponentTeam != null;
        }

        private void OnPlay()
        {
            if (_userTeam == null || _opponentTeam == null) return;

            var gm = GameManager.EnsureExists();
            gm.SetMatchup(_userTeam, _opponentTeam);

            if (SceneLoader.Instance != null)
                SceneLoader.Instance.Load(SceneLoader.Match);
        }

        private void OnBack()
        {
            if (SceneLoader.Instance != null)
                SceneLoader.Instance.Load(SceneLoader.MainMenu);
        }
    }
}
