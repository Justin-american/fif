// formations.js — formation slot layouts ported from the Unity FormationLibrary.
// Normalized coordinates: x 0..1 (left→right), y 0..1 (own goal→opponent goal).
// The match spawner maps these onto the real pitch per side.

export const Position = {
  GK: 'GK', RB: 'RB', CB: 'CB', LB: 'LB',
  CDM: 'CDM', CM: 'CM', CAM: 'CAM', RW: 'RW', LW: 'LW', ST: 'ST',
};

export const PlayStyle = {
  None: 'None',
  Poacher: 'Poacher',
  Playmaker: 'Playmaker',
  InsideForward: 'InsideForward',
  SpeedDribbler: 'SpeedDribbler',
  TargetMan: 'TargetMan',
  FinesseSpecialist: 'FinesseSpecialist',
  NoNonsenseDefender: 'NoNonsenseDefender',
  BoxToBox: 'BoxToBox',
  AnchorHolding: 'AnchorHolding',
};

export const PositionGroup = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' };

export function groupOf(pos) {
  switch (pos) {
    case Position.GK: return PositionGroup.GK;
    case Position.RB:
    case Position.CB:
    case Position.LB: return PositionGroup.DEF;
    case Position.CDM:
    case Position.CM:
    case Position.CAM: return PositionGroup.MID;
    default: return PositionGroup.FWD;
  }
}

const F = (position, x, y) => ({ position, x, y });

export const FORMATIONS = {
  '4-3-3': [
    F(Position.GK, 0.50, 0.05),
    F(Position.RB, 0.85, 0.25),
    F(Position.CB, 0.62, 0.18),
    F(Position.CB, 0.38, 0.18),
    F(Position.LB, 0.15, 0.25),
    F(Position.CDM, 0.50, 0.38),
    F(Position.CM, 0.68, 0.50),
    F(Position.CM, 0.32, 0.50),
    F(Position.RW, 0.82, 0.72),
    F(Position.LW, 0.18, 0.72),
    F(Position.ST, 0.50, 0.82),
  ],
  '4-2-3-1': [
    F(Position.GK, 0.50, 0.05),
    F(Position.RB, 0.85, 0.25),
    F(Position.CB, 0.62, 0.18),
    F(Position.CB, 0.38, 0.18),
    F(Position.LB, 0.15, 0.25),
    F(Position.CM, 0.62, 0.40),
    F(Position.CDM, 0.38, 0.40),
    F(Position.CAM, 0.50, 0.60),
    F(Position.RW, 0.80, 0.66),
    F(Position.LW, 0.20, 0.66),
    F(Position.ST, 0.50, 0.82),
  ],
};

export function getFormation(name) {
  return FORMATIONS[name] || FORMATIONS['4-3-3'];
}
