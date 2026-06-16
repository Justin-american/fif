using FIF.Data;
using UnityEngine;
using UnityEngine.UI;

namespace FIF.UI
{
    /// <summary>
    /// A single selectable team entry in the Team Select grid. Created from a
    /// prefab and bound to a TeamData. Reports clicks and hovers back to the
    /// TeamSelectController so it can update the details panel and selection.
    /// </summary>
    public class TeamButton : MonoBehaviour
    {
        [SerializeField] private Button button;
        [SerializeField] private Text label;
        [SerializeField] private Image crestImage;     // shows colour/crest
        [SerializeField] private GameObject userMarker; // highlight when chosen as user team
        [SerializeField] private GameObject oppMarker;  // highlight when chosen as opponent

        public TeamData Team { get; private set; }
        private TeamSelectController _owner;

        public void Bind(TeamData team, TeamSelectController owner)
        {
            Team = team;
            _owner = owner;

            if (label != null) label.text = team.teamName;
            if (crestImage != null)
            {
                crestImage.sprite = team.crest;       // may be null placeholder
                crestImage.color = team.primaryColor; // tint as the team colour
            }

            if (button != null)
            {
                button.onClick.RemoveAllListeners();
                button.onClick.AddListener(() => _owner.OnTeamClicked(this));
            }

            SetMarkers(false, false);
        }

        public void SetMarkers(bool isUser, bool isOpponent)
        {
            if (userMarker != null) userMarker.SetActive(isUser);
            if (oppMarker != null) oppMarker.SetActive(isOpponent);
        }
    }
}
