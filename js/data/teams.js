// teams.js — PL-inspired squads ported 1:1 from the Unity TeamDatabase.
// Names are deliberately generic; squads/positions/relative ratings mirror the
// 2025-26 sides. Player tuple order matches the C# P(...) helper:
//   name, number, position, style, pace, shooting, passing, dribbling,
//   defending, physical, heading, foot('R'|'L'), captain(bool)
import { Position as Pos, PlayStyle as PS, groupOf } from './formations.js';

function P(name, number, position, style, pace, shooting, passing, dribbling,
           defending, physical, heading = 55, foot = 'R', captain = false) {
  const acc = Math.max(0, Math.min(100, pace - 1));
  return {
    name, number, position, style, foot, captain,
    pace, acceleration: acc, shooting, passing, dribbling, defending, physical,
    heading, jumping: Math.min(100, heading + 5), stamina: 80,
    vision: Math.round((passing + dribbling) / 2),
    composure: Math.round((shooting + passing) / 2),
    positioning: Math.round((shooting + defending) / 2),
    aggression: physical, weakFoot: 3,
  };
}

function team(name, shortName, formation, atk, def, mid, primary, secondary, xi) {
  return {
    name, shortName, formation,
    attack: atk, defense: def, midfield: mid,
    ovr: Math.round((atk + def + mid) / 3),
    primary, secondary, startingXI: xi,
  };
}

export const TEAMS = [
  team('Manchester Blue', 'MCB', '4-3-3', 88, 84, 89, '#6cb5e3', '#ffffff', [
    P('Donnarumma', 1, Pos.GK, PS.None, 60, 30, 60, 50, 30, 85, 80),
    P('Lewis', 82, Pos.RB, PS.BoxToBox, 82, 55, 78, 76, 80, 72, 65),
    P('Dias', 3, Pos.CB, PS.NoNonsenseDefender, 72, 40, 75, 60, 88, 85, 84),
    P('Gvardiol', 24, Pos.CB, PS.NoNonsenseDefender, 80, 50, 74, 70, 85, 84, 82, 'L'),
    P('Ait-Nouri', 33, Pos.LB, PS.BoxToBox, 85, 60, 76, 80, 78, 73, 62, 'L'),
    P('Rodri', 16, Pos.CDM, PS.AnchorHolding, 66, 75, 88, 78, 85, 84, 80),
    P('Reijnders', 4, Pos.CM, PS.BoxToBox, 78, 76, 84, 82, 72, 74, 65),
    P('B. Silva', 20, Pos.CM, PS.Playmaker, 76, 78, 87, 88, 65, 66, 55, 'L', true),
    P('Foden', 47, Pos.RW, PS.InsideForward, 82, 85, 84, 88, 50, 66, 58, 'L'),
    P('Doku', 11, Pos.LW, PS.SpeedDribbler, 93, 78, 74, 90, 40, 68, 50),
    P('Haaland', 9, Pos.ST, PS.Poacher, 89, 93, 70, 78, 45, 90, 91),
  ]),
  team('North London Red', 'NLR', '4-3-3', 86, 86, 86, '#e82a2e', '#ffffff', [
    P('Raya', 22, Pos.GK, PS.None, 60, 30, 72, 55, 30, 80, 78),
    P('B. White', 4, Pos.RB, PS.NoNonsenseDefender, 80, 55, 78, 75, 82, 78, 70),
    P('Saliba', 2, Pos.CB, PS.NoNonsenseDefender, 84, 45, 76, 70, 88, 86, 85),
    P('Gabriel', 6, Pos.CB, PS.NoNonsenseDefender, 78, 50, 72, 62, 87, 88, 88, 'L'),
    P('Calafiori', 33, Pos.LB, PS.BoxToBox, 82, 60, 80, 82, 80, 76, 66, 'L'),
    P('Rice', 41, Pos.CM, PS.BoxToBox, 80, 75, 84, 80, 84, 85, 72),
    P('Zubimendi', 36, Pos.CDM, PS.AnchorHolding, 70, 68, 85, 78, 82, 78, 70),
    P('Odegaard', 8, Pos.CAM, PS.Playmaker, 76, 82, 88, 88, 60, 64, 55, 'L', true),
    P('Saka', 7, Pos.RW, PS.InsideForward, 86, 85, 85, 89, 55, 72, 58, 'L'),
    P('Eze', 10, Pos.LW, PS.SpeedDribbler, 85, 82, 82, 89, 50, 70, 55),
    P('Gyokeres', 14, Pos.ST, PS.Poacher, 88, 89, 72, 80, 48, 86, 84),
  ]),
  team('Merseyside Red', 'MSR', '4-3-3', 87, 84, 85, '#c70d29', '#ffffff', [
    P('Alisson', 1, Pos.GK, PS.None, 62, 30, 78, 60, 30, 84, 80),
    P('Alexander-Arnold', 66, Pos.RB, PS.Playmaker, 80, 70, 90, 80, 76, 70, 62),
    P('Konate', 5, Pos.CB, PS.NoNonsenseDefender, 84, 45, 72, 66, 86, 87, 85),
    P('Van Dijk', 4, Pos.CB, PS.NoNonsenseDefender, 80, 55, 80, 70, 91, 90, 92, 'R', true),
    P('Robertson', 26, Pos.LB, PS.BoxToBox, 84, 60, 82, 80, 80, 74, 64, 'L'),
    P('Mac Allister', 10, Pos.CM, PS.BoxToBox, 76, 78, 86, 84, 76, 74, 66),
    P('Gravenberch', 38, Pos.CDM, PS.AnchorHolding, 80, 70, 84, 85, 80, 82, 70),
    P('Szoboszlai', 8, Pos.CM, PS.BoxToBox, 82, 82, 84, 84, 70, 78, 68),
    P('Salah', 11, Pos.RW, PS.InsideForward, 90, 90, 84, 90, 45, 72, 60, 'L'),
    P('Diaz', 7, Pos.LW, PS.SpeedDribbler, 88, 80, 80, 88, 48, 68, 55),
    P('Nunez', 9, Pos.ST, PS.TargetMan, 89, 82, 70, 78, 45, 86, 82),
  ]),
  team('North London White', 'NLW', '4-3-3', 82, 78, 80, '#eeeef2', '#0c2e73', [
    P('Vicario', 1, Pos.GK, PS.None, 60, 30, 68, 55, 30, 78, 76),
    P('Porro', 23, Pos.RB, PS.BoxToBox, 82, 65, 80, 80, 74, 70, 60),
    P('Romero', 17, Pos.CB, PS.NoNonsenseDefender, 78, 50, 74, 66, 86, 84, 84),
    P('Van de Ven', 37, Pos.CB, PS.NoNonsenseDefender, 92, 45, 70, 70, 84, 82, 80, 'L'),
    P('Udogie', 13, Pos.LB, PS.BoxToBox, 85, 58, 76, 80, 78, 76, 62, 'L'),
    P('Bissouma', 8, Pos.CDM, PS.AnchorHolding, 78, 65, 78, 80, 82, 82, 70),
    P('Maddison', 10, Pos.CAM, PS.Playmaker, 74, 80, 86, 86, 58, 64, 55),
    P('Bentancur', 30, Pos.CM, PS.BoxToBox, 72, 70, 82, 78, 78, 76, 66),
    P('Kulusevski', 21, Pos.RW, PS.InsideForward, 82, 80, 82, 84, 58, 80, 66),
    P('Son', 7, Pos.LW, PS.InsideForward, 88, 87, 80, 86, 50, 72, 60, 'R', true),
    P('Richarlison', 9, Pos.ST, PS.TargetMan, 82, 80, 70, 78, 50, 82, 82),
  ]),
  team('Manchester Red', 'MCR', '4-2-3-1', 80, 78, 78, '#d91d24', '#111111', [
    P('Onana', 24, Pos.GK, PS.None, 62, 30, 74, 60, 30, 80, 78),
    P('Dalot', 20, Pos.RB, PS.BoxToBox, 82, 60, 78, 78, 78, 74, 64),
    P('L. Martinez', 6, Pos.CB, PS.NoNonsenseDefender, 78, 45, 76, 70, 86, 80, 80, 'L'),
    P('Branthwaite', 5, Pos.CB, PS.NoNonsenseDefender, 80, 45, 72, 66, 84, 86, 85, 'L'),
    P('Shaw', 23, Pos.LB, PS.BoxToBox, 78, 55, 78, 76, 80, 78, 64, 'L'),
    P('Mainoo', 37, Pos.CM, PS.BoxToBox, 76, 70, 82, 84, 74, 74, 64),
    P('Casemiro', 18, Pos.CDM, PS.AnchorHolding, 66, 72, 78, 72, 84, 88, 84),
    P('Bruno Fernandes', 8, Pos.CAM, PS.Playmaker, 76, 84, 88, 84, 64, 74, 66, 'R', true),
    P('Garnacho', 17, Pos.RW, PS.SpeedDribbler, 88, 80, 76, 86, 45, 70, 55),
    P('Antony', 21, Pos.LW, PS.InsideForward, 82, 78, 78, 84, 48, 66, 52, 'L'),
    P('Hojlund', 9, Pos.ST, PS.Poacher, 86, 80, 68, 78, 45, 82, 80),
  ]),
  team('West London Blue', 'WLB', '4-2-3-1', 83, 80, 81, '#1f4599', '#ffffff', [
    P('Sanchez', 1, Pos.GK, PS.None, 60, 30, 70, 55, 30, 80, 78),
    P('R. James', 24, Pos.RB, PS.BoxToBox, 84, 70, 82, 82, 82, 80, 66, 'R', true),
    P('Chalobah', 14, Pos.CB, PS.NoNonsenseDefender, 78, 45, 72, 66, 84, 82, 82),
    P('Tosin', 4, Pos.CB, PS.NoNonsenseDefender, 78, 45, 70, 64, 82, 84, 83),
    P('Cucurella', 3, Pos.LB, PS.BoxToBox, 80, 55, 76, 80, 80, 74, 60, 'L'),
    P('Caicedo', 25, Pos.CDM, PS.AnchorHolding, 80, 68, 80, 80, 85, 84, 72),
    P('Enzo Fernandez', 8, Pos.CM, PS.Playmaker, 76, 80, 86, 82, 72, 76, 66),
    P('Palmer', 10, Pos.CAM, PS.FinesseSpecialist, 78, 86, 84, 86, 55, 72, 60),
    P('Neto', 7, Pos.RW, PS.SpeedDribbler, 88, 80, 78, 86, 50, 68, 55),
    P('B. Gittens', 11, Pos.LW, PS.SpeedDribbler, 89, 78, 74, 86, 42, 64, 50),
    P('Joao Pedro', 9, Pos.ST, PS.Poacher, 82, 82, 76, 82, 50, 78, 78),
  ]),
  team('Tyneside', 'TYN', '4-3-3', 82, 81, 81, '#111111', '#ffffff', [
    P('Pope', 22, Pos.GK, PS.None, 58, 30, 64, 50, 30, 84, 82),
    P('Trippier', 2, Pos.RB, PS.Playmaker, 76, 65, 86, 78, 78, 70, 62),
    P('Botman', 4, Pos.CB, PS.NoNonsenseDefender, 78, 45, 74, 66, 85, 84, 85, 'L'),
    P('Schar', 5, Pos.CB, PS.NoNonsenseDefender, 74, 55, 78, 68, 83, 82, 82),
    P('Hall', 20, Pos.LB, PS.BoxToBox, 86, 55, 76, 80, 78, 74, 60, 'L'),
    P('Bruno Guimaraes', 39, Pos.CM, PS.BoxToBox, 78, 78, 86, 86, 80, 80, 68, 'R', true),
    P('Tonali', 8, Pos.CDM, PS.AnchorHolding, 74, 75, 84, 80, 82, 82, 72),
    P('Joelinton', 7, Pos.CM, PS.BoxToBox, 78, 76, 78, 80, 78, 88, 78),
    P('Almiron', 24, Pos.RW, PS.SpeedDribbler, 88, 76, 76, 82, 52, 66, 56),
    P('A. Gordon', 10, Pos.LW, PS.SpeedDribbler, 90, 80, 78, 86, 50, 70, 56),
    P('Isak', 14, Pos.ST, PS.Poacher, 88, 88, 76, 86, 46, 80, 80),
  ]),
  team('Midlands Claret', 'MDC', '4-3-3', 80, 78, 79, '#731933', '#66b3f2', [
    P('E. Martinez', 1, Pos.GK, PS.None, 60, 30, 70, 56, 30, 82, 80),
    P('Cash', 2, Pos.RB, PS.BoxToBox, 84, 60, 76, 76, 78, 78, 64),
    P('Konsa', 4, Pos.CB, PS.NoNonsenseDefender, 82, 45, 72, 68, 84, 82, 80),
    P('Pau Torres', 14, Pos.CB, PS.NoNonsenseDefender, 76, 48, 78, 70, 84, 80, 80, 'L'),
    P('Digne', 27, Pos.LB, PS.Playmaker, 80, 58, 80, 78, 78, 72, 60, 'L'),
    P('McGinn', 7, Pos.CM, PS.BoxToBox, 78, 78, 80, 80, 76, 80, 68, 'R', true),
    P('Kamara', 44, Pos.CDM, PS.AnchorHolding, 76, 66, 80, 78, 82, 80, 70),
    P('Tielemans', 8, Pos.CM, PS.Playmaker, 70, 78, 85, 80, 72, 74, 66),
    P('Malen', 10, Pos.RW, PS.SpeedDribbler, 88, 78, 76, 84, 46, 66, 54),
    P('Rogers', 19, Pos.LW, PS.InsideForward, 86, 78, 80, 84, 50, 70, 56, 'R'),
    P('Watkins', 11, Pos.ST, PS.Poacher, 89, 84, 74, 82, 48, 80, 78),
  ]),
];

export function teamByName(name) {
  return TEAMS.find((t) => t.name === name) || TEAMS[0];
}

// Outfield-only "skeleton" used by Practice Attacking (GK already excluded).
export function gkOnly(t) {
  return t.startingXI.filter((p) => groupOf(p.position) === 'GK');
}
