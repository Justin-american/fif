using System.Collections.Generic;
using System.Text;

namespace FIF.Data
{
    /// <summary>
    /// Lightweight, dependency-free checks that a <see cref="TeamData"/> squad is
    /// well-formed for the formation it declares (Part B). Surfaces problems as
    /// human-readable warnings so the <c>TeamDatabase</c> (and the Inspector) can
    /// flag bad data before the spawner ever tries to place the XI.
    ///
    /// Rules enforced:
    /// <list type="bullet">
    /// <item>The starting XI has exactly 11 players, none null.</item>
    /// <item>The declared formation is known to <see cref="FormationLibrary"/>.</item>
    /// <item>Exactly one goalkeeper.</item>
    /// <item>Exactly one captain.</item>
    /// <item>Each XI slot's role band matches the formation slot at that index.</item>
    /// </list>
    /// </summary>
    public static class SquadValidator
    {
        /// <summary>
        /// Validates a team and returns the list of problems found. An empty list
        /// means the squad is valid.
        /// </summary>
        public static List<string> Validate(TeamData team)
        {
            var problems = new List<string>();
            if (team == null)
            {
                problems.Add("Team is null.");
                return problems;
            }

            string label = string.IsNullOrEmpty(team.teamName) ? "(unnamed team)" : team.teamName;
            var xi = team.startingXI;

            // Length / null checks.
            if (xi == null || xi.Count != FormationLibrary.SlotCount)
            {
                int count = xi == null ? 0 : xi.Count;
                problems.Add($"{label}: starting XI must have {FormationLibrary.SlotCount} players (has {count}).");
            }

            // Formation must be known.
            var slots = FormationLibrary.Get(team.formation);
            if (slots == null)
                problems.Add($"{label}: unknown formation \"{team.formation}\".");

            if (xi == null)
                return problems;

            // GK / captain counts + null entries.
            int goalkeepers = 0;
            int captains = 0;
            for (int i = 0; i < xi.Count; i++)
            {
                var p = xi[i];
                if (p == null)
                {
                    problems.Add($"{label}: starting XI slot {i} is empty.");
                    continue;
                }
                if (p.position == PlayerPosition.GK) goalkeepers++;
                if (p.isCaptain) captains++;
            }

            if (goalkeepers != 1)
                problems.Add($"{label}: expected exactly 1 goalkeeper, found {goalkeepers}.");
            if (captains != 1)
                problems.Add($"{label}: expected exactly 1 captain, found {captains}.");

            // Slot-by-slot role-band match (only when lengths line up).
            if (slots != null && xi.Count == slots.Length)
            {
                for (int i = 0; i < slots.Length; i++)
                {
                    var p = xi[i];
                    if (p == null) continue;
                    var expected = slots[i].Group;
                    var actual = FormationLibrary.GroupOf(p.position);
                    if (expected != actual)
                    {
                        problems.Add(
                            $"{label}: slot {i} ({p.displayName}) is a {actual} ({p.position}) " +
                            $"but the {team.formation} formation expects a {expected}.");
                    }
                }
            }

            return problems;
        }

        /// <summary>True when the team passes every validation rule.</summary>
        public static bool IsValid(TeamData team) => Validate(team).Count == 0;

        /// <summary>
        /// Validates many teams and returns a single combined report string, or
        /// an empty string when every team is valid.
        /// </summary>
        public static string ValidateAll(IEnumerable<TeamData> teams)
        {
            if (teams == null) return string.Empty;
            var sb = new StringBuilder();
            foreach (var team in teams)
            {
                foreach (var problem in Validate(team))
                    sb.AppendLine(problem);
            }
            return sb.ToString();
        }
    }
}
