// Debug bots are disabled for demo/live play. These are no-op stubs that keep
// the call sites in the stage scenes working (initDebugBots / debugActAs /
// isControlledBy / debugBotsAreActive) without adding any UI or bot behavior.
//
// To re-enable single-browser multi-player testing, restore the previous
// implementation from git history (the "+3 Bots" button + server
// debug_spawn_bots handler).

let _myPid = null;

export function initDebugBots({ myPid } = {}) {
  _myPid = myPid;            // remembered only so isControlledBy(myPid) stays true
}

// No bots: always act as yourself.
export function debugActAs() {
  return undefined;
}

// Each client drives only its own slime.
export function isControlledBy(pid) {
  return pid === _myPid;
}

export function debugBotsAreActive() {
  return false;
}
