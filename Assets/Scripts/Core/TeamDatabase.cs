using System.Collections.Generic;
using FIF.Data;
using UnityEngine;

namespace FIF.Core
{
    /// <summary>
    /// Builds the PL-inspired squads from the design brief (PART B) at runtime.
    ///
    /// We construct the TeamData / PlayerProfile ScriptableObjects in code rather
    /// than shipping authored .asset files so the menu flow is fully playable out
    /// of the box. Designers can still author their own assets via the
    /// CreateAssetMenu entries; this database is the default fallback used by the
    /// Team Select screen when no authored teams are assigned.
    ///
    /// Names are deliberately generic (e.g. "Manchester Blue") to avoid trademarks,
    /// while squads, positions and relative ratings mirror the 2025-26 sides.
    /// Ratings are suggested relative values and are fully Inspector-tunable.
    /// </summary>
    public static class TeamDatabase
    {
        private static List<TeamData> _cache;

        /// <summary>Returns the default set of teams, building them once.</summary>
        public static List<TeamData> GetTeams()
        {
            if (_cache != null) return _cache;
            _cache = new List<TeamData>
            {
                BuildManchesterBlue(),
                BuildNorthLondonRed(),
                BuildMerseysideRed(),
                BuildNorthLondonWhite(),
                BuildManchesterRed(),
                BuildWestLondonBlue(),
                BuildTyneside(),
                BuildMidlandsClaret()
            };
            return _cache;
        }

        // ----- Construction helpers -------------------------------------------

        private static TeamData MakeTeam(string name, string shortName, string formation,
            int atk, int def, int mid, Color primary, Color secondary)
        {
            var t = ScriptableObject.CreateInstance<TeamData>();
            t.teamName = name;
            t.shortName = shortName;
            t.formation = formation;
            t.attack = atk;
            t.defense = def;
            t.midfield = mid;
            t.primaryColor = primary;
            t.secondaryColor = secondary;
            return t;
        }

        /// <summary>Creates a player with the common attributes. Fine-grained fields
        /// default sensibly and can be tuned later; play style drives behaviour.</summary>
        private static PlayerProfile P(string name, int number, PlayerPosition pos, PlayStyle style,
            int pace, int shooting, int passing, int dribbling, int defending, int physical,
            int heading = 55, PreferredFoot foot = PreferredFoot.Right, bool captain = false)
        {
            var p = ScriptableObject.CreateInstance<PlayerProfile>();
            p.displayName = name;
            p.shirtNumber = number;
            p.position = pos;
            p.playStyle = style;
            p.preferredFoot = foot;
            p.isCaptain = captain;
            p.pace = pace;
            p.acceleration = Mathf.Clamp(pace + NameBasedOffset(name, -3, 3), 0, 100);
            p.shooting = shooting;
            p.passing = passing;
            p.dribbling = dribbling;
            p.defending = defending;
            p.physical = physical;
            p.heading = heading;
            p.jumping = Mathf.Clamp(heading + 5, 0, 100);
            p.stamina = 80;
            p.vision = Mathf.Clamp((passing + dribbling) / 2, 0, 100);
            p.composure = Mathf.Clamp((shooting + passing) / 2, 0, 100);
            p.positioning = Mathf.Clamp((shooting + defending) / 2, 0, 100);
            p.aggression = Mathf.Clamp(physical, 0, 100);
            p.weakFoot = 3;
            return p;
        }

        // Tiny deterministic, name-seeded offset so derived stats are not all identical.
        private static int NameBasedOffset(string seed, int min, int max)
        {
            int h = Mathf.Abs(seed.GetHashCode());
            return min + (h % (max - min + 1));
        }

        // ----- Teams ----------------------------------------------------------

        private static TeamData BuildManchesterBlue()
        {
            var t = MakeTeam("Manchester Blue", "MCB", "4-3-3", 88, 84, 89,
                new Color(0.42f, 0.71f, 0.89f), Color.white);
            t.startingXI = new List<PlayerProfile>
            {
                P("Donnarumma", 1, PlayerPosition.GK, PlayStyle.None, 60, 30, 60, 50, 30, 85, 80),
                P("Lewis", 82, PlayerPosition.RB, PlayStyle.BoxToBox, 82, 55, 78, 76, 80, 72, 65),
                P("Dias", 3, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 72, 40, 75, 60, 88, 85, 84),
                P("Gvardiol", 24, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 80, 50, 74, 70, 85, 84, 82, PreferredFoot.Left),
                P("Ait-Nouri", 33, PlayerPosition.LB, PlayStyle.BoxToBox, 85, 60, 76, 80, 78, 73, 62, PreferredFoot.Left),
                P("Rodri", 16, PlayerPosition.CDM, PlayStyle.AnchorHolding, 66, 75, 88, 78, 85, 84, 80),
                P("Reijnders", 4, PlayerPosition.CM, PlayStyle.BoxToBox, 78, 76, 84, 82, 72, 74, 65),
                P("B. Silva", 20, PlayerPosition.CM, PlayStyle.Playmaker, 76, 78, 87, 88, 65, 66, 55, PreferredFoot.Left, true),
                P("Foden", 47, PlayerPosition.RW, PlayStyle.InsideForward, 82, 85, 84, 88, 50, 66, 58, PreferredFoot.Left),
                P("Doku", 11, PlayerPosition.LW, PlayStyle.SpeedDribbler, 93, 78, 74, 90, 40, 68, 50),
                P("Haaland", 9, PlayerPosition.ST, PlayStyle.Poacher, 89, 93, 70, 78, 45, 90, 91)
            };
            return t;
        }

        private static TeamData BuildNorthLondonRed()
        {
            var t = MakeTeam("North London Red", "NLR", "4-3-3", 86, 86, 86,
                new Color(0.91f, 0.16f, 0.18f), Color.white);
            t.startingXI = new List<PlayerProfile>
            {
                P("Raya", 22, PlayerPosition.GK, PlayStyle.None, 60, 30, 72, 55, 30, 80, 78),
                P("B. White", 4, PlayerPosition.RB, PlayStyle.NoNonsenseDefender, 80, 55, 78, 75, 82, 78, 70),
                P("Saliba", 2, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 84, 45, 76, 70, 88, 86, 85),
                P("Gabriel", 6, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 50, 72, 62, 87, 88, 88, PreferredFoot.Left),
                P("Calafiori", 33, PlayerPosition.LB, PlayStyle.BoxToBox, 82, 60, 80, 82, 80, 76, 66, PreferredFoot.Left),
                P("Rice", 41, PlayerPosition.CM, PlayStyle.BoxToBox, 80, 75, 84, 80, 84, 85, 72),
                P("Zubimendi", 36, PlayerPosition.CDM, PlayStyle.AnchorHolding, 70, 68, 85, 78, 82, 78, 70),
                P("Odegaard", 8, PlayerPosition.CAM, PlayStyle.Playmaker, 76, 82, 88, 88, 60, 64, 55, PreferredFoot.Left, true),
                P("Saka", 7, PlayerPosition.RW, PlayStyle.InsideForward, 86, 85, 85, 89, 55, 72, 58, PreferredFoot.Left),
                P("Eze", 10, PlayerPosition.LW, PlayStyle.SpeedDribbler, 85, 82, 82, 89, 50, 70, 55),
                P("Gyokeres", 14, PlayerPosition.ST, PlayStyle.Poacher, 88, 89, 72, 80, 48, 86, 84)
            };
            return t;
        }

        private static TeamData BuildMerseysideRed()
        {
            var t = MakeTeam("Merseyside Red", "MSR", "4-3-3", 87, 84, 85,
                new Color(0.78f, 0.05f, 0.16f), Color.white);
            t.startingXI = new List<PlayerProfile>
            {
                P("Alisson", 1, PlayerPosition.GK, PlayStyle.None, 62, 30, 78, 60, 30, 84, 80),
                P("Alexander-Arnold", 66, PlayerPosition.RB, PlayStyle.Playmaker, 80, 70, 90, 80, 76, 70, 62),
                P("Konate", 5, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 84, 45, 72, 66, 86, 87, 85),
                P("Van Dijk", 4, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 80, 55, 80, 70, 91, 90, 92, PreferredFoot.Right, true),
                P("Robertson", 26, PlayerPosition.LB, PlayStyle.BoxToBox, 84, 60, 82, 80, 80, 74, 64, PreferredFoot.Left),
                P("Mac Allister", 10, PlayerPosition.CM, PlayStyle.BoxToBox, 76, 78, 86, 84, 76, 74, 66),
                P("Gravenberch", 38, PlayerPosition.CDM, PlayStyle.AnchorHolding, 80, 70, 84, 85, 80, 82, 70),
                P("Szoboszlai", 8, PlayerPosition.CM, PlayStyle.BoxToBox, 82, 82, 84, 84, 70, 78, 68),
                P("Salah", 11, PlayerPosition.RW, PlayStyle.InsideForward, 90, 90, 84, 90, 45, 72, 60, PreferredFoot.Left),
                P("Diaz", 7, PlayerPosition.LW, PlayStyle.SpeedDribbler, 88, 80, 80, 88, 48, 68, 55),
                P("Nunez", 9, PlayerPosition.ST, PlayStyle.TargetMan, 89, 82, 70, 78, 45, 86, 82)
            };
            return t;
        }

        private static TeamData BuildNorthLondonWhite()
        {
            var t = MakeTeam("North London White", "NLW", "4-3-3", 82, 78, 80,
                new Color(0.93f, 0.93f, 0.95f), new Color(0.05f, 0.18f, 0.45f));
            t.startingXI = new List<PlayerProfile>
            {
                P("Vicario", 1, PlayerPosition.GK, PlayStyle.None, 60, 30, 68, 55, 30, 78, 76),
                P("Porro", 23, PlayerPosition.RB, PlayStyle.BoxToBox, 82, 65, 80, 80, 74, 70, 60),
                P("Romero", 17, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 50, 74, 66, 86, 84, 84),
                P("Van de Ven", 37, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 92, 45, 70, 70, 84, 82, 80, PreferredFoot.Left),
                P("Udogie", 13, PlayerPosition.LB, PlayStyle.BoxToBox, 85, 58, 76, 80, 78, 76, 62, PreferredFoot.Left),
                P("Bissouma", 8, PlayerPosition.CDM, PlayStyle.AnchorHolding, 78, 65, 78, 80, 82, 82, 70),
                P("Maddison", 10, PlayerPosition.CAM, PlayStyle.Playmaker, 74, 80, 86, 86, 58, 64, 55),
                P("Bentancur", 30, PlayerPosition.CM, PlayStyle.BoxToBox, 72, 70, 82, 78, 78, 76, 66),
                P("Kulusevski", 21, PlayerPosition.RW, PlayStyle.InsideForward, 82, 80, 82, 84, 58, 80, 66),
                P("Son", 7, PlayerPosition.LW, PlayStyle.InsideForward, 88, 87, 80, 86, 50, 72, 60, PreferredFoot.Right, true),
                P("Richarlison", 9, PlayerPosition.ST, PlayStyle.TargetMan, 82, 80, 70, 78, 50, 82, 82)
            };
            return t;
        }

        private static TeamData BuildManchesterRed()
        {
            var t = MakeTeam("Manchester Red", "MCR", "4-2-3-1", 80, 78, 78,
                new Color(0.85f, 0.11f, 0.14f), Color.black);
            t.startingXI = new List<PlayerProfile>
            {
                P("Onana", 24, PlayerPosition.GK, PlayStyle.None, 62, 30, 74, 60, 30, 80, 78),
                P("Dalot", 20, PlayerPosition.RB, PlayStyle.BoxToBox, 82, 60, 78, 78, 78, 74, 64),
                P("L. Martinez", 6, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 45, 76, 70, 86, 80, 80, PreferredFoot.Left),
                P("Branthwaite", 5, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 80, 45, 72, 66, 84, 86, 85, PreferredFoot.Left),
                P("Shaw", 23, PlayerPosition.LB, PlayStyle.BoxToBox, 78, 55, 78, 76, 80, 78, 64, PreferredFoot.Left),
                P("Mainoo", 37, PlayerPosition.CM, PlayStyle.BoxToBox, 76, 70, 82, 84, 74, 74, 64),
                P("Casemiro", 18, PlayerPosition.CDM, PlayStyle.AnchorHolding, 66, 72, 78, 72, 84, 88, 84),
                P("Bruno Fernandes", 8, PlayerPosition.CAM, PlayStyle.Playmaker, 76, 84, 88, 84, 64, 74, 66, PreferredFoot.Right, true),
                P("Garnacho", 17, PlayerPosition.RW, PlayStyle.SpeedDribbler, 88, 80, 76, 86, 45, 70, 55, PreferredFoot.Right),
                P("Antony", 21, PlayerPosition.LW, PlayStyle.InsideForward, 82, 78, 78, 84, 48, 66, 52, PreferredFoot.Left),
                P("Hojlund", 9, PlayerPosition.ST, PlayStyle.Poacher, 86, 80, 68, 78, 45, 82, 80)
            };
            return t;
        }

        private static TeamData BuildWestLondonBlue()
        {
            var t = MakeTeam("West London Blue", "WLB", "4-2-3-1", 83, 80, 81,
                new Color(0.12f, 0.27f, 0.6f), Color.white);
            t.startingXI = new List<PlayerProfile>
            {
                P("Sanchez", 1, PlayerPosition.GK, PlayStyle.None, 60, 30, 70, 55, 30, 80, 78),
                P("R. James", 24, PlayerPosition.RB, PlayStyle.BoxToBox, 84, 70, 82, 82, 82, 80, 66, PreferredFoot.Right, true),
                P("Chalobah", 14, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 45, 72, 66, 84, 82, 82),
                P("Tosin", 4, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 45, 70, 64, 82, 84, 83),
                P("Cucurella", 3, PlayerPosition.LB, PlayStyle.BoxToBox, 80, 55, 76, 80, 80, 74, 60, PreferredFoot.Left),
                P("Caicedo", 25, PlayerPosition.CDM, PlayStyle.AnchorHolding, 80, 68, 80, 80, 85, 84, 72),
                P("Enzo Fernandez", 8, PlayerPosition.CM, PlayStyle.Playmaker, 76, 80, 86, 82, 72, 76, 66),
                P("Neto", 7, PlayerPosition.RW, PlayStyle.SpeedDribbler, 88, 80, 78, 86, 50, 68, 55),
                P("Palmer", 10, PlayerPosition.CAM, PlayStyle.FinesseSpecialist, 78, 86, 84, 86, 55, 72, 60),
                P("B. Gittens", 11, PlayerPosition.LW, PlayStyle.SpeedDribbler, 89, 78, 74, 86, 42, 64, 50),
                P("Joao Pedro", 9, PlayerPosition.ST, PlayStyle.Poacher, 82, 82, 76, 82, 50, 78, 78)
            };
            return t;
        }

        private static TeamData BuildTyneside()
        {
            var t = MakeTeam("Tyneside", "TYN", "4-3-3", 82, 81, 81,
                Color.black, Color.white);
            t.startingXI = new List<PlayerProfile>
            {
                P("Pope", 22, PlayerPosition.GK, PlayStyle.None, 58, 30, 64, 50, 30, 84, 82),
                P("Trippier", 2, PlayerPosition.RB, PlayStyle.Playmaker, 76, 65, 86, 78, 78, 70, 62),
                P("Botman", 4, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 78, 45, 74, 66, 85, 84, 85, PreferredFoot.Left),
                P("Schar", 5, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 74, 55, 78, 68, 83, 82, 82),
                P("Hall", 20, PlayerPosition.LB, PlayStyle.BoxToBox, 86, 55, 76, 80, 78, 74, 60, PreferredFoot.Left),
                P("Bruno Guimaraes", 39, PlayerPosition.CM, PlayStyle.BoxToBox, 78, 78, 86, 86, 80, 80, 68),
                P("Tonali", 8, PlayerPosition.CDM, PlayStyle.AnchorHolding, 74, 75, 84, 80, 82, 82, 72),
                P("Joelinton", 7, PlayerPosition.CM, PlayStyle.BoxToBox, 78, 76, 78, 80, 78, 88, 78),
                P("Almiron", 24, PlayerPosition.RW, PlayStyle.SpeedDribbler, 88, 76, 76, 82, 52, 66, 56),
                P("A. Gordon", 10, PlayerPosition.LW, PlayStyle.SpeedDribbler, 90, 80, 78, 86, 50, 70, 56),
                P("Isak", 14, PlayerPosition.ST, PlayStyle.Poacher, 88, 88, 76, 86, 46, 80, 80)
            };
            return t;
        }

        private static TeamData BuildMidlandsClaret()
        {
            var t = MakeTeam("Midlands Claret", "MDC", "4-3-3", 80, 78, 79,
                new Color(0.45f, 0.1f, 0.2f), new Color(0.4f, 0.7f, 0.95f));
            t.startingXI = new List<PlayerProfile>
            {
                P("E. Martinez", 1, PlayerPosition.GK, PlayStyle.None, 60, 30, 70, 56, 30, 82, 80),
                P("Cash", 2, PlayerPosition.RB, PlayStyle.BoxToBox, 84, 60, 76, 76, 78, 78, 64),
                P("Konsa", 4, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 82, 45, 72, 68, 84, 82, 80),
                P("Pau Torres", 14, PlayerPosition.CB, PlayStyle.NoNonsenseDefender, 76, 48, 78, 70, 84, 80, 80, PreferredFoot.Left),
                P("Digne", 27, PlayerPosition.LB, PlayStyle.Playmaker, 80, 58, 80, 78, 78, 72, 60, PreferredFoot.Left),
                P("McGinn", 7, PlayerPosition.CM, PlayStyle.BoxToBox, 78, 78, 80, 80, 76, 80, 68),
                P("Kamara", 44, PlayerPosition.CDM, PlayStyle.AnchorHolding, 76, 66, 80, 78, 82, 80, 70),
                P("Tielemans", 8, PlayerPosition.CM, PlayStyle.Playmaker, 70, 78, 85, 80, 72, 74, 66),
                P("Malen", 10, PlayerPosition.RW, PlayStyle.SpeedDribbler, 88, 78, 76, 84, 46, 66, 54),
                P("Rogers", 19, PlayerPosition.LW, PlayStyle.InsideForward, 86, 78, 80, 84, 50, 70, 56, PreferredFoot.Right),
                P("Watkins", 11, PlayerPosition.ST, PlayStyle.Poacher, 89, 84, 74, 82, 48, 80, 78)
            };
            return t;
        }
    }
}
