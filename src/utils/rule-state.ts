/**
 * How far a decision of the fixed formula has gone, as the platform tells it (`state` of the dispatch detail), for the page: the colour of its tag and the steps of the way that are done.
 * The way is four steps: the calculation, the recommendation that took it, the mode that lets it reach the cluster (admission, auto: the mode recommend stops at the second step) and the operator's action.
 */

type State =
  | 'not_followed'
  | 'observe_only'
  | 'unavailable'
  | 'pending'
  | 'recommended'
  | 'admission'
  | 'waiting_operator'
  | 'executed';

/** how many steps of the way are done in a state (0 to 4) */
export function stateStep(state: string): number {
  switch (state as State) {
    case 'pending':
      return 1;
    case 'recommended':
      return 2;
    case 'admission':
    case 'waiting_operator':
      return 3;
    case 'executed':
      return 4;
    default:
      return 0;
  }
}

/** the type of the tag of a state: green when the operator acted, blue while it is on its way, orange when the formula cannot be followed, plain otherwise */
export function stateType(state: string): 'default' | 'info' | 'success' | 'warning' {
  switch (state as State) {
    case 'executed':
      return 'success';
    case 'pending':
    case 'recommended':
    case 'admission':
    case 'waiting_operator':
      return 'info';
    case 'unavailable':
      return 'warning';
    default:
      return 'default';
  }
}
