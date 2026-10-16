// Landing grade from the physics `land` event.
// tilt: cos of the angle between the car's up vector and the surface normal (1 = flat).
// impact: speed into the surface in m/s (vertical speed on flat ground).
//
// PERFECT  nearly flat and soft: tilt within 7 degrees and impact up to 12 m/s
//          (a big drop needs a lift-thruster cushion before touchdown).
// GOOD     a decent landing: roughness <= 1, where roughness adds the tilt
//          (24 degrees alone is the limit) and the impact above 15 m/s (60 m/s span).
// SLOPPY   everything else that still lands (the physics crashes past ~60 degrees).
const GRADE_TUNING = {
  perfectTilt: 7,
  perfectImpact: 12,
  goodTilt: 24,
  softImpact: 15,
  impactSpan: 60,
};
const GRADE_MULT = { perfect: 1.5, good: 1, sloppy: 0.5 };
const GRADE_LABEL = { perfect: "PERFECT", good: "GOOD", sloppy: "SLOPPY" };

function tiltDegrees(tilt) {
  return (Math.acos(Math.max(-1, Math.min(1, tilt))) * 180) / Math.PI;
}
function landingGrade(tilt, impact) {
  const g = GRADE_TUNING,
    deg = tiltDegrees(tilt),
    imp = Math.max(0, impact || 0);
  if (deg <= g.perfectTilt && imp <= g.perfectImpact) return "perfect";
  const rough = deg / g.goodTilt + Math.max(0, imp - g.softImpact) / g.impactSpan;
  return rough <= 1 ? "good" : "sloppy";
}

export { GRADE_LABEL, GRADE_MULT, GRADE_TUNING, landingGrade, tiltDegrees };
