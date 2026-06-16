using System;
using System.Collections.Generic;
using FIF.Core;
using FIF.Data;

namespace FIF.Match
{
    /// <summary>
    /// The deterministic, headless heart of the match (Part C, consuming the
    /// Part D laws layer). It spawns both squads from their Part B formation data,
    /// ticks ball physics and player steering, runs simple <see cref="PlayStyle"/>
    /// aware AI for possession/pressing/shooting, and defers goals, restarts,
    /// fouls and offside to the <see cref="Referee"/> and saves to the
    /// <see cref="Goalkeeper"/>. It has no Unity dependency, so a whole match can
    /// be simulated and asserted in a plain test.
    /// </summary>
    public sealed class MatchEngine
    {
        public Pitch Pitch { get; }
        public MatchBall Ball { get; }
        public int HomeScore { get; private set; }
        public int AwayScore { get; private set; }
        public float Clock { get; private set; }
        public int Half { get; private set; } = 1;
        public bool Finished { get; private set; }
        public GameMode Mode { get; }
        public IReadOnlyList<string> EventLog => _events;

        /// <summary>Drill attempts and conversions for the practice modes.</summary>
        public int DrillAttempts { get; private set; }
        public int DrillGoals { get; private set; }

        private readonly MatchConfig _cfg;
        private readonly Random _rng;
        private readonly List<MatchPlayer> _all = new List<MatchPlayer>();
        private readonly List<MatchPlayer> _home = new List<MatchPlayer>();
        private readonly List<MatchPlayer> _away = new List<MatchPlayer>();
        private readonly List<string> _events = new List<string>();

        private MatchPlayer _possessor;
        private TeamSide _lastTouch = TeamSide.Home;
        private bool _ballLoose;
        private Vec2 _kickOrigin;

        private const float ShootRange = 20f;
        private const float TackleRange = 1.1f;

        public MatchEngine(TeamData homeTeam, TeamData awayTeam, GameMode mode, MatchConfig config)
        {
            Mode = mode;
            _cfg = config ?? new MatchConfig();
            _rng = new Random(_cfg.Seed);
            Pitch = new Pitch();
            Ball = new MatchBall(Pitch.Centre);

            SpawnTeam(homeTeam, TeamSide.Home, _home);
            if (mode == GameMode.FullMatch)
                SpawnTeam(awayTeam, TeamSide.Away, _away);
            else
                SpawnKeeperOnly(awayTeam, TeamSide.Away, _away);

            _all.AddRange(_home);
            _all.AddRange(_away);

            SetupForMode();
        }

        private double Rng() => _rng.NextDouble();
        private float Signed() => (float)(_rng.NextDouble() * 2.0 - 1.0);

        // ----- Spawning -------------------------------------------------------

        private void SpawnTeam(TeamData team, TeamSide side, List<MatchPlayer> into)
        {
            var slots = team != null ? team.FormationSlots : null;
            slots = slots ?? FormationLibrary.Get("4-3-3");
            var xi = team != null ? team.startingXI : null;

            for (int i = 0; i < FormationLibrary.SlotCount; i++)
            {
                var profile = (xi != null && i < xi.Count) ? xi[i] : null;
                Vec2 home = Pitch.FromFormation(slots[i], side);
                into.Add(new MatchPlayer(profile, side, home));
            }
        }

        private void SpawnKeeperOnly(TeamData team, TeamSide side, List<MatchPlayer> into)
        {
            PlayerProfile gk = null;
            if (team != null && team.startingXI != null)
            {
                foreach (var p in team.startingXI)
                    if (p != null && p.position == PlayerPosition.GK) { gk = p; break; }
            }
            var slot = new FormationSlot(PlayerPosition.GK, 0.5f, 0.05f);
            into.Add(new MatchPlayer(gk, side, Pitch.FromFormation(slot, side)));
        }

        private void SetupForMode()
        {
            switch (Mode)
            {
                case GameMode.PracticePenalty:
                    StartPenaltyDrill();
                    break;
                case GameMode.PracticeFreeKick:
                    StartFreeKickDrill();
                    break;
                default:
                    StartKickOff(TeamSide.Home);
                    break;
            }
        }

        // ----- Public driving -------------------------------------------------

        /// <summary>Advances the simulation by one configured time step.</summary>
        public void Step() => Tick(_cfg.TimeStep);

        /// <summary>Runs the match (or a fixed number of drill reps) to completion.</summary>
        public void SimulateToEnd(int maxDrillReps = 20)
        {
            if (Mode == GameMode.PracticePenalty || Mode == GameMode.PracticeFreeKick)
            {
                while (!Finished && DrillAttempts < maxDrillReps)
                    Step();
                Finished = true;
                return;
            }

            // Two halves of simulated time.
            int guard = 0;
            int maxSteps = (int)(_cfg.HalfLengthSeconds * 2 / _cfg.TimeStep) + 100;
            while (!Finished && guard++ < maxSteps)
                Step();
            Finished = true;
        }

        // ----- Core tick ------------------------------------------------------

        public void Tick(float dt)
        {
            if (Finished) return;

            Clock += dt;
            if (Mode == GameMode.FullMatch && Clock >= _cfg.HalfLengthSeconds)
            {
                if (Half == 1)
                {
                    Half = 2;
                    Clock = 0f;
                    Log("Half-time.");
                    StartKickOff(TeamSide.Away);
                }
                else
                {
                    Finished = true;
                    Log($"Full-time: {HomeScore}-{AwayScore}.");
                    return;
                }
            }

            Ball.Tick(dt);
            UpdatePossession();
            ComputeAndMove(dt);

            if (_possessor != null)
                ResolveOnBall(dt);

            ResolveStoppages();
        }

        // ----- Possession -----------------------------------------------------

        private void UpdatePossession()
        {
            if (_possessor != null)
            {
                // Glue the ball to the controlling player's feet.
                Ball.Place(_possessor.Position);
                return;
            }

            // A loose ball can only be (re)gathered once it has left the kicker.
            if (_ballLoose && Vec2.Distance(Ball.Position, _kickOrigin) < _cfg.ControlRadius * 1.5f)
                return;

            MatchPlayer nearest = null;
            float best = _cfg.ControlRadius;
            for (int i = 0; i < _all.Count; i++)
            {
                float d = Vec2.Distance(_all[i].Position, Ball.Position);
                if (d < best) { best = d; nearest = _all[i]; }
            }

            if (nearest != null)
            {
                _possessor = nearest;
                _lastTouch = nearest.Side;
                _ballLoose = false;
                Ball.Place(nearest.Position);
            }
        }

        // ----- Movement / shape ----------------------------------------------

        private void ComputeAndMove(float dt)
        {
            MatchPlayer pressHome = null, pressAway = null;
            if (_possessor != null)
            {
                var pressers = _possessor.Side == TeamSide.Home ? _away : _home;
                var presser = ClosestOutfield(pressers, _possessor.Position);
                if (_possessor.Side == TeamSide.Home) pressAway = presser; else pressHome = presser;
            }

            MatchPlayer chaseHome = null, chaseAway = null;
            if (_possessor == null)
            {
                chaseHome = ClosestOutfield(_home, Ball.Position);
                chaseAway = ClosestOutfield(_away, Ball.Position);
            }

            for (int i = 0; i < _all.Count; i++)
            {
                var p = _all[i];
                if (p.IsGoalkeeper)
                {
                    p.MoveTowards(Goalkeeper.DesiredPosition(p, Pitch, Ball.Position), dt);
                    continue;
                }
                if (p == _possessor)
                {
                    // The on-ball player dribbles toward goal; ball follows in glue.
                    p.MoveTowards(DribbleTarget(p), dt);
                    continue;
                }
                if (p == pressHome || p == pressAway)
                {
                    p.MoveTowards(_possessor.Position, dt);
                    continue;
                }
                if (p == chaseHome || p == chaseAway)
                {
                    p.MoveTowards(Ball.Position, dt);
                    continue;
                }
                p.MoveTowards(FormationTarget(p), dt);
            }
        }

        private Vec2 DribbleTarget(MatchPlayer p)
        {
            Vec2 goal = Pitch.AttackingGoalCentre(p.Side);
            // Inside forwards drift centrally; speed dribblers head straight.
            return Vec2.MoveTowards(p.Position, goal, 6f);
        }

        private Vec2 FormationTarget(MatchPlayer p)
        {
            // Slide the block towards the ball's length, keeping defensive shape.
            float sign = Pitch.AttackingGoalLine(p.Side) > 0f ? 1f : -1f;
            float ballAdvance = Ball.Position.y * sign; // how far ball is upfield for this side
            float push = ballAdvance * 0.2f;
            var target = new Vec2(
                p.HomePosition.x + (Ball.Position.x - p.HomePosition.x) * 0.1f,
                p.HomePosition.y + sign * push);
            return Pitch.Clamp(target);
        }

        private MatchPlayer ClosestOutfield(List<MatchPlayer> team, Vec2 to)
        {
            MatchPlayer best = null;
            float bestD = float.MaxValue;
            for (int i = 0; i < team.Count; i++)
            {
                if (team[i].IsGoalkeeper) continue;
                float d = Vec2.Distance(team[i].Position, to);
                if (d < bestD) { bestD = d; best = team[i]; }
            }
            return best;
        }

        // ----- On-ball decisions ---------------------------------------------

        private void ResolveOnBall(float dt)
        {
            var p = _possessor;

            // Pressing tackle?
            var opp = p.Side == TeamSide.Home ? _away : _home;
            var tackler = ClosestOutfield(opp, p.Position);
            if (tackler != null && Vec2.Distance(tackler.Position, p.Position) <= TackleRange)
            {
                if (TryTackle(tackler, p))
                    return;
            }

            float distToGoal = Vec2.Distance(p.Position, Pitch.AttackingGoalCentre(p.Side));

            // Shoot when in range and reasonably central.
            if (distToGoal <= ShootRange && Math.Abs(p.Position.x) < 10f)
            {
                float shootProb = ShootProbability(p, distToGoal) * dt * 1.0f;
                if (Rng() < shootProb)
                {
                    Shoot(p, distToGoal);
                    return;
                }
            }

            // Otherwise occasionally pass forward to a better-placed team-mate.
            float passProb = (0.4f + 0.4f * _cfg.OpponentSkill) * dt * 2.5f;
            if (Rng() < passProb)
                TryPass(p);
        }

        private bool TryTackle(MatchPlayer tackler, MatchPlayer holder)
        {
            float def = tackler.Profile != null ? tackler.Profile.defending : 50;
            float drb = holder.Profile != null ? holder.Profile.dribbling : 60;
            float chance = 0.2f + (def - drb) / 200f;
            chance = Clamp01(chance) * (0.4f + 0.6f * _cfg.OpponentSkill);

            if (Rng() >= chance) return false;

            // Possible foul, more likely from aggressive tacklers.
            float aggression = tackler.Profile != null ? tackler.Profile.aggression : 50;
            float foulChance = 0.12f + aggression / 100f * 0.18f;
            if (Rng() < foulChance)
            {
                var restart = Referee.AwardFreeKick(Pitch, holder.Position, holder.Side);
                Log(restart.type == RestartType.Penalty
                    ? $"Penalty to {SideName(holder.Side)}!"
                    : $"Free kick to {SideName(holder.Side)}.");
                ApplyRestart(restart);
                return true;
            }

            // Clean tackle: possession turns over.
            _possessor = tackler;
            _lastTouch = tackler.Side;
            _ballLoose = false;
            Ball.Place(tackler.Position);
            return true;
        }

        private float ShootProbability(MatchPlayer p, float distToGoal)
        {
            float shooting = p.Profile != null ? p.Profile.shooting : 60;
            float composure = p.Profile != null ? p.Profile.composure : 60;
            float baseP = (shooting + composure) / 200f;
            float rangeFactor = 1f - distToGoal / ShootRange; // closer → likelier
            float style = p.Style == PlayStyle.Poacher || p.Style == PlayStyle.FinesseSpecialist ? 1.25f : 1f;
            return Clamp01(baseP * (0.4f + 0.6f * rangeFactor) * style);
        }

        private void Shoot(MatchPlayer p, float distToGoal)
        {
            DrillAttempts++;
            Vec2 goal = Pitch.AttackingGoalCentre(p.Side);

            // Aim error grows with distance and shrinks with shooting/composure.
            float accuracy = p.Profile != null ? (p.Profile.shooting + p.Profile.composure) / 200f : 0.6f;
            float spread = (1.1f - accuracy) * (1.5f + distToGoal / ShootRange);
            float lateral = Signed() * spread;
            float aimX = goal.x + lateral;

            float halfGoal = Pitch.GoalWidth * 0.5f;
            float shotSpeed = 22f + accuracy * 8f;
            _lastTouch = p.Side;

            // Off target → it will run out of play (goal kick/corner handled later).
            if (Math.Abs(aimX) > halfGoal + 0.2f)
            {
                KickLoose(p, new Vec2(aimX, goal.y), shotSpeed);
                Log($"{Name(p)} shoots wide.");
                return;
            }

            // On target → the keeper gets a chance to save.
            var keeper = FindKeeper(Other(p.Side));
            if (keeper != null)
            {
                float onTargetError = Math.Abs(aimX - goal.x);
                bool saved = Goalkeeper.TrySave(keeper, onTargetError, shotSpeed, distToGoal, Rng);
                if (saved)
                {
                    _possessor = keeper;
                    _lastTouch = keeper.Side;
                    _ballLoose = false;
                    Ball.Place(keeper.Position);
                    Log($"Saved! {Name(keeper)} denies {Name(p)}.");
                    return;
                }
            }

            // Goal-bound and beats the keeper.
            KickLoose(p, new Vec2(aimX, goal.y), shotSpeed);
            Log($"{Name(p)} shoots.");
        }

        private void TryPass(MatchPlayer p)
        {
            var mates = p.Side == TeamSide.Home ? _home : _away;
            float sign = Pitch.AttackingGoalLine(p.Side) > 0f ? 1f : -1f;

            MatchPlayer best = null;
            float bestScore = float.NegativeInfinity;
            for (int i = 0; i < mates.Count; i++)
            {
                var m = mates[i];
                if (m == p || m.IsGoalkeeper) continue;
                float advance = (m.Position.y - p.Position.y) * sign; // forward gain
                float dist = Vec2.Distance(m.Position, p.Position);
                if (dist < 3f || dist > 40f) continue;
                float score = advance - dist * 0.1f;
                if (score > bestScore) { bestScore = score; best = m; }
            }

            if (best == null) return;

            // Offside check at the moment of the pass.
            var defenders = p.Side == TeamSide.Home ? _away : _home;
            if (Referee.IsOffside(Pitch, p.Side, best.Position, Ball.Position, defenders))
            {
                var fk = new Restart(RestartType.FreeKick, Pitch.Clamp(best.Position), Other(p.Side));
                Log($"Offside against {SideName(p.Side)}.");
                ApplyRestart(fk);
                return;
            }

            float dirDist = Vec2.Distance(best.Position, p.Position);
            float passSpeed = Math.Min(26f, 8f + dirDist);
            KickLoose(p, best.Position, passSpeed);
        }

        private void KickLoose(MatchPlayer from, Vec2 target, float speed)
        {
            _kickOrigin = from.Position;
            _ballLoose = true;
            _possessor = null;
            _lastTouch = from.Side;
            Ball.Place(from.Position);
            Ball.Kick(target - from.Position, speed);
        }

        // ----- Stoppages / restarts ------------------------------------------

        private void ResolveStoppages()
        {
            if (Referee.IsGoal(Pitch, Ball.Position, out TeamSide scorer))
            {
                if (scorer == TeamSide.Home) HomeScore++; else AwayScore++;
                if (scorer == _lastTouch) DrillGoals++;
                Log($"GOAL! {SideName(scorer)} — {HomeScore}-{AwayScore}.");

                if (Mode == GameMode.PracticePenalty) StartPenaltyDrill();
                else if (Mode == GameMode.PracticeFreeKick) StartFreeKickDrill();
                else StartKickOff(scorer == TeamSide.Home ? TeamSide.Away : TeamSide.Home);
                return;
            }

            if (!Pitch.IsInBounds(Ball.Position))
            {
                if (Mode == GameMode.PracticePenalty) { StartPenaltyDrill(); return; }
                if (Mode == GameMode.PracticeFreeKick) { StartFreeKickDrill(); return; }

                var restart = Referee.ResolveBoundary(Pitch, Ball.Position, _lastTouch);
                ApplyRestart(restart);
            }
        }

        private void ApplyRestart(Restart r)
        {
            Ball.Place(r.ballPosition);
            _ballLoose = false;
            _possessor = null;
            // The taking side will gather it; flag last touch as the opponent so
            // the taking side is allowed to control immediately.
            _lastTouch = Other(r.takingSide);

            // Move the nearest taker onto the ball so play resumes cleanly.
            var team = r.takingSide == TeamSide.Home ? _home : _away;
            var taker = ClosestOutfield(team, r.ballPosition);
            if (taker != null)
            {
                taker.Position = r.ballPosition;
                _possessor = taker;
                _lastTouch = r.takingSide;
                Ball.Place(taker.Position);
            }
        }

        private void StartKickOff(TeamSide side)
        {
            ResetPositions();
            var ko = Referee.KickOff(Pitch, side);
            ApplyRestart(ko);
        }

        private void StartPenaltyDrill()
        {
            DrillAttempts = DrillAttempts; // attempts counted on the shot
            ResetPositions();
            var spot = Pitch.AttackingPenaltySpot(TeamSide.Home);
            Ball.Place(spot);
            _ballLoose = false;
            // Put the best shooter on the spot.
            var taker = BestShooter(_home);
            if (taker != null)
            {
                taker.Position = new Vec2(spot.x, spot.y - 1f);
                _possessor = taker;
                _lastTouch = TeamSide.Home;
            }
        }

        private void StartFreeKickDrill()
        {
            ResetPositions();
            var goal = Pitch.AttackingGoalCentre(TeamSide.Home);
            var spot = new Vec2(Signed() * 6f, goal.y - 22f);
            Ball.Place(spot);
            _ballLoose = false;
            var taker = BestShooter(_home);
            if (taker != null)
            {
                taker.Position = new Vec2(spot.x, spot.y - 1f);
                _possessor = taker;
                _lastTouch = TeamSide.Home;
            }
        }

        private void ResetPositions()
        {
            for (int i = 0; i < _all.Count; i++)
                _all[i].Position = _all[i].HomePosition;
            Ball.Place(Pitch.Centre);
            _possessor = null;
            _ballLoose = false;
        }

        // ----- Helpers --------------------------------------------------------

        private MatchPlayer FindKeeper(TeamSide side)
        {
            var team = side == TeamSide.Home ? _home : _away;
            for (int i = 0; i < team.Count; i++)
                if (team[i].IsGoalkeeper) return team[i];
            return null;
        }

        private MatchPlayer BestShooter(List<MatchPlayer> team)
        {
            MatchPlayer best = null;
            int bestShoot = -1;
            for (int i = 0; i < team.Count; i++)
            {
                if (team[i].IsGoalkeeper || team[i].Profile == null) continue;
                if (team[i].Profile.shooting > bestShoot)
                {
                    bestShoot = team[i].Profile.shooting;
                    best = team[i];
                }
            }
            return best;
        }

        private static TeamSide Other(TeamSide s) => s == TeamSide.Home ? TeamSide.Away : TeamSide.Home;
        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
        private string SideName(TeamSide s) => s.ToString();
        private static string Name(MatchPlayer p) => p?.Profile != null ? p.Profile.displayName : "Player";

        private void Log(string message)
        {
            // Keep the log bounded for long simulations.
            if (_events.Count < 500)
                _events.Add($"[{Half}|{Clock:0}s] {message}");
        }
    }
}
